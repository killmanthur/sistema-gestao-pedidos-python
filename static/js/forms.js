// static/js/forms.js
// Responsabilidade: Lógica de todos os formulários de criação
// (criar pedido, criar orçamento, criar sugestão).

import { AppState } from './state.js';
import { toggleButtonLoading } from './ui.js';
import { showToast } from './toasts.js'; // A importação já deve estar aqui

// A função showSuccessMessage não é mais necessária, podemos removê-la.
export function renderNewItemRow(containerId, itemLabel = 'Item') {
    const itensContainer = document.getElementById(containerId);
    if (!itensContainer) return null;

    const itemCounter = itensContainer.children.length + 1;
    // CORREÇÃO: Usando a nova classe 'item-row' e 'close-modal' para o botão de fechar
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

    itemRow.innerHTML = `
        <div class="item-row-header">
            <h4>${itemLabel} ${itemCounter}</h4>
            <button type="button" class="close-modal" title="Remover Item">×</button>
        </div>
        <div class="item-row-fields">${fieldsHTML}</div>
    `;

    // CORREÇÃO: A lógica de fechar agora é global, mas precisamos da lógica para remover o elemento do DOM
    itemRow.querySelector('.close-modal').addEventListener('click', (e) => {
        e.stopPropagation(); // Impede que o clique feche um modal pai, se houver
        itemRow.remove();
        // Re-numera os itens restantes
        const allHeaders = itensContainer.querySelectorAll('.item-row-header h4');
        allHeaders.forEach((header, index) => {
            header.textContent = `${itemLabel} ${index + 1}`;
        });
    });

    itensContainer.appendChild(itemRow);
    return itemRow;
}


// --- Formulário de Pedido de Produto (Múltiplos Itens) ---

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
                // MUDANÇA: Usando showToast em vez de showSuccessMessage
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

// --- Formulário de Atualização de Orçamento (Simples) ---
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
                // MUDANÇA: Usando showToast em vez de showSuccessMessage
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