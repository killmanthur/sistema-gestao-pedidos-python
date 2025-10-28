// static/js/forms.js
import { AppState } from './state.js';
import { toggleButtonLoading } from './ui.js';
import { showToast } from './toasts.js';

export function renderNewItemRow(containerId, itemLabel = 'Item') {
    const itensContainer = document.getElementById(containerId);
    if (!itensContainer) return null;

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