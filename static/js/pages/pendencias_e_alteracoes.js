import { AppState } from '../state.js';
import { db } from '../firebase.js';
import { showToast } from '../toasts.js';
import { toggleButtonLoading, formatarData, showConfirmModal } from '../ui.js';

let state = {};

function resetState() {
    state = {
        elementos: {},
        pend_fornecedor: [],
        pend_alteracao: [],
        resolvidos: [],
    };
}

function criarCardPendencia(item, tipoPendencia) {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.id = item.id;

    // CORREÇÃO AQUI: Obtenha as permissões do usuário logado
    const perms = AppState.currentUser.permissions || {};

    let corBorda = 'danger';
    if (tipoPendencia === 'alteracao') corBorda = 'info';
    if (item.status === 'Finalizado') corBorda = 'done';

    card.classList.add(`card--status-${corBorda}`);

    // ... (lógica do footerAction permanece a mesma)
    let footerAction = '';
    const gestorPodeResolver = (['Admin', 'Estoque'].includes(AppState.currentUser.role)) && tipoPendencia === 'fornecedor';
    const contabilidadePodeResolver = (['Admin', 'Contabilidade'].includes(AppState.currentUser.role)) && tipoPendencia === 'alteracao';

    if (item.status !== 'Finalizado' && (gestorPodeResolver || contabilidadePodeResolver)) {
        footerAction = `<button class="btn btn--primary" data-action="resolver">Resolver</button>`;
    }

    // CORREÇÃO AQUI: Monta os botões do header condicionalmente
    let headerActions = '';

    // Adiciona o botão de editar SOMENTE se o usuário tiver a permissão
    if (perms.pode_editar_pendencia) {
        headerActions += `<button class="btn-icon" data-action="edit" title="Editar Informações da NF"><img src="/static/edit.svg" alt="Editar"></button>`;
    }

    // A lógica para o botão de deletar permanece a mesma
    if (perms.pode_deletar_conferencia) {
        headerActions += `<button class="btn-icon" data-action="delete" title="Excluir"><img src="/static/delete.svg" alt="Excluir"></button>`;
    }

    let observacoesHTML = '';
    if (item.observacoes) {
        observacoesHTML = '<div class="obs-log-container">';
        Object.values(item.observacoes)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .forEach(obs => {
                observacoesHTML += `<div class="obs-entry"><strong>${obs.autor}:</strong> ${obs.texto}<small>${formatarData(obs.timestamp)}</small></div>`;
            });
        observacoesHTML += '</div>';
    }

    card.innerHTML = `
        <div class="card__header">
            <h3>NF: ${item.numero_nota_fiscal}</h3>
            <div class="card__header-actions">${headerActions}</div>
        </div>
        <div class="card__body">
            <p><strong>Fornecedor:</strong> ${item.nome_fornecedor}</p>
            <p><strong>Responsável:</strong> ${item.conferentes ? item.conferentes.join(', ') : 'N/A'}</p>
            ${observacoesHTML}
        </div>
        <div class="card__footer">
            <div class="card__actions">${footerAction}</div>
        </div>`;

    card.querySelector('[data-action="resolver"]')?.addEventListener('click', () => openResolverModal(item));
    card.querySelector('[data-action="edit"]')?.addEventListener('click', () => openEditModal(item));
    card.querySelector('[data-action="delete"]')?.addEventListener('click', () => handleDelete(item.id));

    return card;
}

function renderizarColunas() {
    const termo = state.elementos.filtroInput.value.toLowerCase().trim();
    const filterFn = item => String(item.numero_nota_fiscal).toLowerCase().includes(termo) || String(item.nome_fornecedor).toLowerCase().includes(termo);

    const render = (container, data, tipoPendencia) => {
        container.innerHTML = '';
        const filtered = data.filter(filterFn);
        if (filtered.length > 0) {
            filtered.forEach(item => container.appendChild(criarCardPendencia(item, tipoPendencia)));
        } else {
            container.innerHTML = `<p class="quadro-vazio-msg">Nenhum item aqui.</p>`;
        }
    };

    if (state.elementos.quadroFornecedor) render(state.elementos.quadroFornecedor, state.pend_fornecedor, 'fornecedor');
    if (state.elementos.quadroAlteracao) render(state.elementos.quadroAlteracao, state.pend_alteracao, 'alteracao');
    render(state.elementos.quadroResolvidos, state.resolvidos, 'finalizado');
}

function openResolverModal(item) {
    const modal = state.elementos.resolverModal;
    modal.form.dataset.id = item.id;
    modal.obsInput.value = '';
    const histContainer = modal.form.querySelector('#historico-observacoes');
    histContainer.innerHTML = '<h4>Histórico de Observações:</h4>';
    if (item.observacoes) {
        Object.values(item.observacoes).sort((a, b) => new Date(b.timestamp) - new Date(b.timestamp)).forEach(obs => {
            histContainer.innerHTML += `<div class="obs-entry"><small>${formatarData(obs.timestamp)} - <strong>${obs.autor}</strong></small><p>${obs.texto}</p></div>`;
        });
    } else {
        histContainer.innerHTML += '<p>Nenhuma observação ainda.</p>';
    }
    modal.overlay.style.display = 'flex';
}

async function handleAddUpdate() {
    const modal = state.elementos.resolverModal;
    const id = modal.form.dataset.id;
    const observacao = modal.obsInput.value;
    const btn = state.elementos.resolverModal.btnAddUpdate;

    if (!observacao.trim()) {
        showToast('A observação não pode estar vazia para adicionar uma atualização.', 'error');
        return;
    }

    toggleButtonLoading(btn, true, 'Adicionando...');
    try {
        const response = await fetch(`/api/conferencias/${id}/observacao`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                autor: AppState.currentUser.nome,
                texto: `[ATUALIZAÇÃO] ${observacao}`
            })
        });
        if (!response.ok) throw new Error((await response.json()).error);

        showToast('Atualização adicionada com sucesso!', 'success');

        modal.obsInput.value = '';
        const snapshot = await db.ref(`conferencias/${id}`).once('value');
        const updatedItem = { id, ...snapshot.val() };
        openResolverModal(updatedItem); // Reabre o modal com a info atualizada

    } catch (error) {
        showToast(`Erro: ${error.message}`, 'error');
    } finally {
        toggleButtonLoading(btn, false, 'Adicionar Atualização');
    }
}

async function handleResolverSubmit(event) {
    event.preventDefault();
    const modal = state.elementos.resolverModal;
    const id = modal.form.dataset.id;
    const observacao = modal.obsInput.value;
    const btn = modal.form.querySelector('button[type="submit"]');

    if (!observacao.trim()) {
        showToast('A observação de resolução é obrigatória.', 'error');
        return;
    }

    toggleButtonLoading(btn, true, 'Resolvendo...');
    try {
        const response = await fetch(`/api/conferencias/${id}/resolver-item`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                editor_nome: AppState.currentUser.nome,
                user_role: AppState.currentUser.role,
                observacao: observacao
            })
        });
        if (!response.ok) throw new Error((await response.json()).error);
        showToast('Item resolvido com sucesso!', 'success');
        modal.overlay.style.display = 'none';
    } catch (error) {
        showToast(`Erro: ${error.message}`, 'error');
    } finally {
        toggleButtonLoading(btn, false, 'Marcar como Resolvido');
    }
}

function openEditModal(item) {
    const modal = state.elementos.editModal;
    modal.form.dataset.id = item.id;
    modal.form.querySelector('#edit-numero-nota-fiscal').value = item.numero_nota_fiscal;
    modal.form.querySelector('#edit-nome-fornecedor').value = item.nome_fornecedor;
    modal.form.querySelector('#edit-nome-transportadora').value = item.nome_transportadora;
    modal.form.querySelector('#edit-qtd-volumes').value = item.qtd_volumes;

    const perms = AppState.currentUser.permissions || {};
    modal.deleteButton.style.display = perms.pode_deletar_conferencia ? 'inline-block' : 'none';

    modal.overlay.style.display = 'flex';
}

async function handleEditFormSubmit(event) {
    event.preventDefault();
    const modal = state.elementos.editModal;
    const id = modal.form.dataset.id;
    const saveButton = modal.form.querySelector('button[type="submit"]');

    toggleButtonLoading(saveButton, true, 'Salvando...');
    const dados = {
        numero_nota_fiscal: document.getElementById('edit-numero-nota-fiscal').value,
        nome_fornecedor: document.getElementById('edit-nome-fornecedor').value,
        nome_transportadora: document.getElementById('edit-nome-transportadora').value,
        qtd_volumes: document.getElementById('edit-qtd-volumes').value,
        editor_nome: AppState.currentUser.nome,
    };
    try {
        const response = await fetch(`/api/conferencias/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados),
        });
        if (!response.ok) throw new Error((await response.json()).error);
        showToast('Recebimento atualizado!', 'success');
        modal.overlay.style.display = 'none';
    } catch (error) {
        showToast(`Erro: ${error.message}`, 'error');
    } finally {
        toggleButtonLoading(saveButton, false, 'Salvar Alterações');
    }
}

const handleDelete = (id) => {
    // A função showConfirmModal já existe em ui.js, então podemos chamá-la diretamente.
    showConfirmModal('Tem certeza que deseja excluir esta conferência? Esta ação é irreversível.', async () => {
        try {
            const response = await fetch(`/api/conferencias/${id}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ editor_nome: AppState.currentUser.nome })
            });
            if (!response.ok) throw new Error((await response.json()).error);
            showToast('Conferência excluída com sucesso!', 'success');
        } catch (error) {
            showToast(`Erro ao excluir: ${error.message}`, 'error');
        }
    });
};

export function initPendenciasEAlteracoesPage() {
    resetState();
    state.elementos = {
        filtroInput: document.getElementById('filtro-pendencias'),
        colunaFornecedor: document.getElementById('coluna-pendencia-fornecedor'),
        quadroFornecedor: document.getElementById('quadro-pendencia-fornecedor'),
        colunaAlteracao: document.getElementById('coluna-solicitacao-alteracao'),
        quadroAlteracao: document.getElementById('quadro-solicitacao-alteracao'),
        quadroResolvidos: document.getElementById('quadro-resolvidos'),
        resolverModal: {
            overlay: document.getElementById('resolver-modal-overlay'),
            form: document.getElementById('form-resolver'),
            obsInput: document.getElementById('resolver-observacao'),
            btnAddUpdate: document.getElementById('btn-add-update'),
        },
        editModal: {
            overlay: document.getElementById('edit-recebimento-modal-overlay'),
            form: document.getElementById('form-edit-recebimento'),
            deleteButton: document.getElementById('btn-excluir-recebimento')
        }
    };

    state.elementos.filtroInput.addEventListener('input', renderizarColunas);
    state.elementos.resolverModal.form.addEventListener('submit', handleResolverSubmit);
    state.elementos.resolverModal.btnAddUpdate.addEventListener('click', handleAddUpdate);
    state.elementos.editModal.form.addEventListener('submit', handleEditFormSubmit);
    state.elementos.editModal.deleteButton.addEventListener('click', () => {
        const id = state.elementos.editModal.form.dataset.id;
        handleDelete(id);
    });

    const ref = db.ref('conferencias');
    ref.on('value', snapshot => {
        const data = snapshot.val() || {};
        const lista = Object.entries(data).map(([id, itemData]) => ({ id, ...itemData }));
        const userRole = AppState.currentUser.role;

        state.pend_fornecedor = lista.filter(c => ['Pendente (Fornecedor)', 'Pendente (Ambos)'].includes(c.status) && !c.resolvido_gestor);
        state.pend_alteracao = lista.filter(c => ['Pendente (Alteração)', 'Pendente (Ambos)'].includes(c.status) && !c.resolvido_contabilidade);
        state.resolvidos = lista.filter(c => c.status === 'Finalizado');

        const isAdmin = userRole === 'Admin';
        state.elementos.colunaFornecedor.style.display = (isAdmin || userRole === 'Estoque') ? 'block' : 'none';
        state.elementos.colunaAlteracao.style.display = (isAdmin || userRole === 'Estoque','Contabilidade') ? 'block' : 'none';

        renderizarColunas();
    });
}