// static/js/pages/gestao_pendencias.js
import { AppState } from '../state.js';
import { db } from '../firebase.js';
import { showToast } from '../toasts.js';
import { toggleButtonLoading, formatarData, showConfirmModal } from '../ui.js';

let state = {};

function resetState() {
    state = {
        elementos: {},
        pendentes: [],
        resolvidos: [],
    };
}

// NOVO: Função para abrir o modal de edição localmente
function openEditModal(item) {
    const modal = state.elementos.editModal;
    modal.form.dataset.id = item.id;
    modal.form.querySelector('#edit-numero-nota-fiscal').value = item.numero_nota_fiscal;
    modal.form.querySelector('#edit-nome-fornecedor').value = item.nome_fornecedor;
    modal.form.querySelector('#edit-nome-transportadora').value = item.nome_transportadora;
    modal.form.querySelector('#edit-qtd-volumes').value = item.qtd_volumes;
    modal.overlay.style.display = 'flex';
}

// NOVO: Função para lidar com o envio do formulário de edição
async function handleEditFormSubmit(event) {
    event.preventDefault();
    const modal = state.elementos.editModal;
    const id = modal.form.dataset.id;
    const saveButton = modal.saveButton;
    toggleButtonLoading(saveButton, true, 'Salvando...');
    const dados = {
        numero_nota_fiscal: modal.form.querySelector('#edit-numero-nota-fiscal').value,
        nome_fornecedor: modal.form.querySelector('#edit-nome-fornecedor').value,
        nome_transportadora: modal.form.querySelector('#edit-nome-transportadora').value,
        qtd_volumes: modal.form.querySelector('#edit-qtd-volumes').value,
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

function criarCardElement(item) {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.id = item.id;

    if (item.status === 'Finalizado') {
        card.classList.add('card--status-done');
    } else {
        card.classList.add('card--status-danger');
    }

    let footerAction = '';
    if (item.status === 'Pendente de Resolução') {
        footerAction = `<button class="btn btn--primary" data-action="manage">Gerenciar</button>`;
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

    const editBtn = `<button class="btn-icon" title="Editar Informações da NF" data-action="edit"><img src="/static/edit.svg" alt="Editar"></button>`;
    const deleteBtn = `<button class="btn-icon" title="Excluir" data-action="delete"><img src="/static/delete.svg" alt="Excluir"></button>`;

    let responsavelHTML = '';
    if (item.vendedor_nome) {
        responsavelHTML = `<p><strong>Vendedor:</strong> ${item.vendedor_nome}</p>`;
    } else {
        responsavelHTML = `<p><strong>Conferente:</strong> ${item.conferente_nome}</p>`;
    }

    // MUDANÇA: Adiciona o horário de início e ajusta os rótulos
    let timeInfoHTML = '';
    if (item.data_inicio_conferencia) {
        timeInfoHTML += `<p><strong>Início Conferência:</strong> ${formatarData(item.data_inicio_conferencia)}</p>`;
    }
    if (item.data_finalizacao) {
        timeInfoHTML += `<p><strong>Finalização:</strong> ${formatarData(item.data_finalizacao)}</p>`;
    }


    card.innerHTML = `
        <div class="card__header">
            <h3>NF: ${item.numero_nota_fiscal}</h3>
            <div class="card__header-actions">${editBtn}${deleteBtn}</div>
        </div>
        <div class="card__body">
            <p><strong>Fornecedor:</strong> ${item.nome_fornecedor}</p>
            ${responsavelHTML}
            ${timeInfoHTML}
            ${observacoesHTML}
        </div>
        <div class="card__footer">
            <div class="card__actions">
                ${footerAction}
            </div>
        </div>`;

    card.querySelector('[data-action="manage"]')?.addEventListener('click', () => openResolverModal(item));
    card.querySelector('[data-action="edit"]')?.addEventListener('click', () => openEditModal(item));
    card.querySelector('[data-action="delete"]')?.addEventListener('click', () => handleDelete(item.id));

    return card;
}

// ... (renderizarColunas, openResolverModal, handleUpdateSubmit, handleDelete permanecem iguais)
function renderizarColunas() {
    const termo = state.elementos.filtroInput.value.toLowerCase().trim();
    const filterFn = item => item.numero_nota_fiscal.toLowerCase().includes(termo) || item.nome_fornecedor.toLowerCase().includes(termo);

    const render = (container, data) => {
        container.innerHTML = '';
        const filtered = data.filter(filterFn);
        if (filtered.length > 0) {
            filtered.forEach(item => container.appendChild(criarCardElement(item)));
        } else {
            container.innerHTML = `<p class="quadro-vazio-msg">Nenhum item aqui.</p>`;
        }
    };
    render(state.elementos.quadroPendentes, state.pendentes);
    render(state.elementos.quadroResolvidos, state.resolvidos);
}

function openResolverModal(item) {
    const modal = state.elementos.resolverModal;
    modal.form.dataset.id = item.id;
    modal.obsInput.value = '';

    const histContainer = modal.form.querySelector('#historico-observacoes');
    histContainer.innerHTML = '<h4>Histórico de Atualizações:</h4>';
    if (item.observacoes) {
        Object.values(item.observacoes).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)).forEach(obs => {
            histContainer.innerHTML += `<div class="obs-entry"><small>${formatarData(obs.timestamp)} - <strong>${obs.autor}</strong></small><p>${obs.texto}</p></div>`;
        });
    } else {
        histContainer.innerHTML += '<p>Nenhuma observação ainda.</p>';
    }

    modal.overlay.style.display = 'flex';
}

async function handleUpdateSubmit(isResolving) {
    const modal = state.elementos.resolverModal;
    const id = modal.form.dataset.id;
    const observacao = modal.obsInput.value;
    const btn = isResolving ? modal.btnResolverFinal : modal.btnAddUpdate;

    if (!observacao.trim()) {
        showToast('A observação não pode estar vazia.', 'error');
        return;
    }

    toggleButtonLoading(btn, true, 'Salvando...');
    try {
        let endpoint = `/api/conferencias/${id}/observacao`;
        let body = { autor: AppState.currentUser.nome, texto: observacao };

        if (isResolving) {
            endpoint = `/api/conferencias/${id}/resolver`;
            body.editor_nome = AppState.currentUser.nome;
            body.observacao = observacao;
        }

        const response = await fetch(endpoint, {
            method: isResolving ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!response.ok) throw new Error((await response.json()).error);

        showToast(isResolving ? 'Pendência resolvida!' : 'Atualização adicionada!', 'success');

        if (isResolving) {
            modal.overlay.style.display = 'none';
        } else {
            modal.obsInput.value = '';
        }
    } catch (error) {
        showToast(`Erro: ${error.message}`, 'error');
    } finally {
        toggleButtonLoading(btn, false, isResolving ? 'Salvar e Resolver' : 'Adicionar Atualização');
    }
}

const handleDelete = (id) => {
    showConfirmModal('Tem certeza que deseja excluir esta conferência? Esta ação é irreversível.', async () => {
        try {
            await fetch(`/api/conferencias/${id}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ editor_nome: AppState.currentUser.nome })
            });
            showToast('Conferência excluída com sucesso!', 'success');
        } catch (error) {
            showToast(`Erro ao excluir: ${error.message}`, 'error');
        }
    });
};


export function initGestaoPendenciasPage() {
    resetState();
    state.elementos = {
        filtroInput: document.getElementById('filtro-pendencias'),
        quadroPendentes: document.getElementById('quadro-pendentes'),
        quadroResolvidos: document.getElementById('quadro-resolvidos'),
        resolverModal: {
            overlay: document.getElementById('resolver-modal-overlay'),
            form: document.getElementById('form-resolver'),
            obsInput: document.getElementById('resolver-observacao'),
            btnAddUpdate: document.getElementById('btn-add-update'),
            btnResolverFinal: document.getElementById('btn-resolve-final'),
        },
        // NOVO: Referências para o modal de edição
        editModal: {
            overlay: document.getElementById('edit-recebimento-modal-overlay'),
            form: document.getElementById('form-edit-recebimento'),
            saveButton: document.getElementById('btn-save-edit-recebimento'),
            cancelButton: document.getElementById('btn-cancel-edit-recebimento'),
            deleteButton: document.getElementById('btn-excluir-recebimento'),
        }
    };

    state.elementos.filtroInput.addEventListener('input', renderizarColunas);
    state.elementos.resolverModal.btnAddUpdate.addEventListener('click', () => handleUpdateSubmit(false));
    state.elementos.resolverModal.form.addEventListener('submit', (e) => {
        e.preventDefault();
        handleUpdateSubmit(true);
    });

    // NOVO: Listeners para o modal de edição
    state.elementos.editModal.form.addEventListener('submit', handleEditFormSubmit);
    state.elementos.editModal.cancelButton.addEventListener('click', () => state.elementos.editModal.overlay.style.display = 'none');
    state.elementos.editModal.deleteButton.addEventListener('click', () => {
        const id = state.elementos.editModal.form.dataset.id;
        handleDelete(id);
    });


    const ref = db.ref('conferencias').orderByChild('status');
    ref.on('value', snapshot => {
        const lista = Object.entries(snapshot.val() || {}).map(([id, data]) => ({ id, ...data }));
        state.pendentes = lista.filter(c => c.status === 'Pendente de Resolução').reverse();
        state.resolvidos = lista.filter(c => c.status === 'Finalizado').reverse();
        renderizarColunas();
    });
}