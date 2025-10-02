// static/js/pages/criar-pedido.js
// Responsabilidade: Inicializar os formulários da página "Pedidos Rua".

import { handleMultiItemFormSubmit, renderNewItemRow } from '../forms.js';

export function initCriarPedidoPage() {
    const btnAddItem = document.getElementById('btn-add-item');
    if (!btnAddItem) return;

    // O listener de clique é adicionado aqui, uma única vez por carregamento de página.
    btnAddItem.addEventListener('click', () => {
        const newItemRow = renderNewItemRow('itens-container', 'Item');
        newItemRow.querySelector('.item-codigo')?.focus();
    });

    // Anexa o listener do formulário de submissão.
    handleMultiItemFormSubmit();

    // Renderiza a primeira linha de item inicial, também apenas uma vez.
    const firstItem = renderNewItemRow('itens-container', 'Item');
    setTimeout(() => firstItem.querySelector('.item-codigo')?.focus(), 100);
}