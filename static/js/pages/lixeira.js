// static/js/pages/lixeira.js
import { AppState } from '../state.js';
import { showToast } from '../toasts.js';
import { formatarData, showConfirmModal } from '../ui.js';

let allItems = [];
let elements = {};

function getDescricaoPrincipal(item) {
    const dados = item.dados_item;
    switch (item.tipo_item) {
        case 'Pedido':
            return `Vendedor: ${dados.vendedor || 'N/A'} - Cód: ${dados.codigo || (dados.itens && dados.itens[0]?.codigo)}`;
        case 'Sugestao':
            return `Vendedor: ${dados.vendedor || 'N/A'} - Itens: ${dados.itens?.length || 0}`;
        case 'Separacao':
            return `Mov: ${dados.numero_movimentacao} - Cliente: ${dados.nome_cliente}`;
        case 'Conferencia':
            return `NF: ${dados.numero_nota_fiscal} - Fornecedor: ${dados.nome_fornecedor}`;
        default:
            return `ID Original: ${item.item_id_original}`;
    }
}

function openDetailsModal(item) {
    const modalOverlay = document.getElementById('details-modal-overlay');
    const modalTitle = document.getElementById('details-modal-title');
    const modalBody = document.getElementById('details-modal-body');

    modalTitle.textContent = `Detalhes do Item Excluído (Tipo: ${item.tipo_item})`;

    // Formata o JSON para exibição
    const formattedJson = JSON.stringify(item.dados_item, null, 2);
    modalBody.innerHTML = `<pre style="background: var(--bg-muted); padding: 1rem; border-radius: 8px;">${formattedJson}</pre>`;

    modalOverlay.style.display = 'flex';
}

async function restaurarItem(itemId) {
    showConfirmModal('Restaurar este item para seu local original?', async () => {
        try {
            const response = await fetch(`/api/lixeira/restaurar/${itemId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ editor_nome: AppState.currentUser.nome })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Falha ao restaurar.');
            }

            showToast('Item restaurado com sucesso!', 'success');
            await fetchAndRenderLixeira(); // Atualiza a tabela

        } catch (error) {
            showToast(`Erro: ${error.message}`, 'error');
        }
    });
}


function renderTable() {
    const searchTerm = elements.filtroInput.value.toLowerCase().trim();
    const filteredItems = searchTerm
        ? allItems.filter(item =>
            item.tipo_item.toLowerCase().includes(searchTerm) ||
            getDescricaoPrincipal(item).toLowerCase().includes(searchTerm) ||
            item.excluido_por.toLowerCase().includes(searchTerm)
        )
        : allItems;

    elements.tableBody.innerHTML = '';
    if (filteredItems.length === 0) {
        elements.tableBody.innerHTML = '<tr><td colspan="5">Nenhum item na lixeira.</td></tr>';
        return;
    }

    filteredItems.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${item.tipo_item}</td>
            <td>${getDescricaoPrincipal(item)}</td>
            <td>${item.excluido_por}</td>
            <td>${formatarData(item.data_exclusao)}</td>
            <td class="actions-cell">
               <button class="btn-action btn-details" data-id="${item.id}">Ver Dados</button>
               <button class="btn-action btn-restore" data-id="${item.id}">Restaurar</button>
            </td>`;
        elements.tableBody.appendChild(tr);
    });
}

async function fetchAndRenderLixeira() {
    elements.spinner.style.display = 'block';
    elements.table.style.display = 'none';

    try {
        const response = await fetch('/api/lixeira');
        if (!response.ok) throw new Error('Falha ao buscar itens da lixeira.');
        allItems = await response.json();
        renderTable();
    } catch (error) {
        showToast(error.message, 'error');
        elements.tableBody.innerHTML = '<tr><td colspan="5" style="color: var(--clr-danger);">Erro ao carregar dados.</td></tr>';
    } finally {
        elements.spinner.style.display = 'none';
        elements.table.style.display = 'table';
    }
}

export function initLixeiraPage() {
    elements = {
        spinner: document.getElementById('loading-spinner-lixeira'),
        table: document.getElementById('tabela-lixeira'),
        tableBody: document.getElementById('tabela-lixeira-body'),
        filtroInput: document.getElementById('filtro-tabela-lixeira'),
        btnAtualizar: document.getElementById('btn-atualizar-lixeira'),
    };
    if (!elements.tableBody) return;

    elements.btnAtualizar.addEventListener('click', fetchAndRenderLixeira);
    elements.filtroInput.addEventListener('input', renderTable);

    elements.tableBody.addEventListener('click', (e) => {
        const target = e.target;
        const itemId = target.dataset.id;
        if (!itemId) return;

        if (target.classList.contains('btn-details')) {
            const item = allItems.find(i => i.id == itemId);
            if (item) openDetailsModal(item);
        } else if (target.classList.contains('btn-restore')) {
            restaurarItem(itemId);
        }
    });

    fetchAndRenderLixeira();
}