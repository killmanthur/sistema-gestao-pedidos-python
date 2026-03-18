// static/js/forms.js
import { AppState } from './state.js';
import { toggleButtonLoading } from './ui.js';
import { showToast } from './toasts.js';

let todosCodigos = null;

async function ensureCodigos() {
    if (todosCodigos !== null) return;
    todosCodigos = [];
    try {
        const res = await fetch('/api/pedidos/codigos-historico');
        if (res.ok) todosCodigos = await res.json();
    } catch (e) { /* silently ignore */ }
}

function getOrCreateDatalist() {
    let dl = document.getElementById('codigos-historico-list');
    if (!dl) {
        dl = document.createElement('datalist');
        dl.id = 'codigos-historico-list';
        document.body.appendChild(dl);
    }
    return dl;
}

function attachAutocomplete(input) {
    input.setAttribute('list', 'codigos-historico-list');
    input.setAttribute('autocomplete', 'off');
    input.addEventListener('input', () => {
        const termo = input.value.trim().toUpperCase();
        const dl = getOrCreateDatalist();
        if (!termo || !todosCodigos) { dl.innerHTML = ''; return; }
        const matches = todosCodigos
            .filter(c => c.includes(termo))
            .slice(0, 5);
        dl.innerHTML = matches.map(c => `<option value="${c}">`).join('');
    });
}

export function renderNewItemRow(containerId, itemLabel = 'Item') {
    const itensContainer = document.getElementById(containerId);
    if (!itensContainer) return null;

    ensureCodigos();

    const itemCounter = itensContainer.children.length + 1;
    const itemRow = document.createElement('div');
    itemRow.className = 'item-row';

    let fieldsHTML = `
        <div class="form-group" style="flex-grow: 1;">
            <label>Código do Produto</label>
            <input type="text" class="item-codigo" required>
        </div>
        <div class="form-group" style="width: 80px;">
            <label>Qtd</label>
            <input type="number" class="item-quantidade" required min="1" value="1">
        </div>
    `;

    // --- CORREÇÃO AQUI ---
    // Adicionada a classe "close-modal-icon" ao botão
    itemRow.innerHTML = `
        <div class="item-row-header">
            <h4>${itemLabel} ${itemCounter}</h4>
            <button type="button" class="close-modal close-modal-icon" title="Remover Item">×</button>
        </div>
        <div class="item-row-fields">${fieldsHTML}</div>
    `;

    itemRow.querySelector('.close-modal').addEventListener('click', (e) => {
        e.stopPropagation();
        itemRow.remove();
        const allHeaders = itensContainer.querySelectorAll('.item-row-header h4');
        allHeaders.forEach((header, index) => {
            header.textContent = `${itemLabel} ${index + 1}`;
        });
    });

    itensContainer.appendChild(itemRow);
    attachAutocomplete(itemRow.querySelector('.item-codigo'));
    return itemRow;
}

// ... (o resto do arquivo permanece o mesmo)
export function handleMultiItemFormSubmit() {
    const formPedido = document.getElementById('form-pedido');
    if (!formPedido) return;
    const submitBtn = formPedido.querySelector('button[type="submit"]');

    formPedido.addEventListener('submit', async (event) => {
        event.preventDefault();
        toggleButtonLoading(submitBtn, true, 'Salvar Pedido');

        const itemRows = document.querySelectorAll('#itens-container .item-row');
        const itens = [];
        let hasError = false;

        itemRows.forEach(row => {
            const codigo = row.querySelector('.item-codigo').value.trim();
            const quantidade = row.querySelector('.item-quantidade').value;
            if (codigo && quantidade) {
                itens.push({ codigo, quantidade });
            } else {
                hasError = true;
            }
        });

        if (hasError || itens.length === 0) {
            showToast("Por favor, preencha o código e a quantidade para todos os itens.", "error");
            toggleButtonLoading(submitBtn, false, 'Salvar Pedido');
            return;
        }

        const observacaoGeral = document.getElementById('observacao-geral').value;

        const dados = {
            tipo_req: 'Pedido Produto',
            vendedor: AppState.currentUser.nome,
            itens: itens,
            observacao_geral: observacaoGeral
        };

        try {
            const response = await fetch('/api/pedidos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dados),
            });
            if (response.ok) {
                const container = document.getElementById('itens-container');
                container.innerHTML = '';
                formPedido.reset();
                renderNewItemRow('itens-container', 'Item');
                showToast('Pedido criado com sucesso!', 'success');
            } else {
                const errorData = await response.json().catch(() => ({ message: 'Erro desconhecido' }));
                showToast(`Falha ao enviar: ${errorData.message || errorData.error}`, 'error');
            }
        } catch (error) {
            showToast('Falha ao enviar: Erro de conexão.', 'error');
        } finally {
            toggleButtonLoading(submitBtn, false, 'Salvar Pedido');
        }
    });
}

export function handleOrcamentoFormSubmit() {
    const formOrcamento = document.getElementById('form-orcamento');
    if (!formOrcamento) return;

    const submitBtn = formOrcamento.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;

    formOrcamento.addEventListener('submit', async (event) => {
        event.preventDefault();
        toggleButtonLoading(submitBtn, true, originalText);

        const dados = {
            tipo_req: 'Atualização Orçamento',
            vendedor: AppState.currentUser.nome,
            codigo: document.getElementById('orcamento-nome').value,
            descricao: document.getElementById('observacao').value
        };

        try {
            const response = await fetch('/api/pedidos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dados),
            });
            if (response.ok) {
                formOrcamento.reset();
                showToast('Requisição de orçamento criada com sucesso!', 'success');
            } else {
                const errorData = await response.json().catch(() => ({ message: 'Erro desconhecido' }));
                showToast(`Falha ao enviar: ${errorData.message || errorData.error}`, 'error');
            }
        } catch (error) {
            showToast('Falha ao enviar: Erro de conexão.', 'error');
        } finally {
            toggleButtonLoading(submitBtn, false, originalText);
        }
    });
}