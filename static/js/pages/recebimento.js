// static/js/pages/recebimento.js
import { AppState } from '../state.js';
import { db } from '../firebase.js';
import { showToast } from '../toasts.js';
import { toggleButtonLoading, formatarData, showConfirmModal } from '../ui.js';

let elementos = {};
let todosOsRecebimentos = [];
let debounceTimer;

function openEditModal(item) {
    const modal = elementos.editModal;
    modal.form.dataset.id = item.id;
    // Usamos querySelector a partir do formulário para garantir que estamos pegando os inputs corretos
    modal.form.querySelector('#edit-numero-nota-fiscal').value = item.numero_nota_fiscal;
    modal.form.querySelector('#edit-nome-fornecedor').value = item.nome_fornecedor;
    modal.form.querySelector('#edit-nome-transportadora').value = item.nome_transportadora;
    modal.form.querySelector('#edit-qtd-volumes').value = item.qtd_volumes;

    if (item.status === 'Pendente de Resolução') {
        modal.btnResolver.style.display = 'inline-block';
        modal.saveButton.textContent = 'Salvar Alterações'; // Garante o texto correto
    } else {
        modal.btnResolver.style.display = 'none';
        modal.saveButton.textContent = 'Salvar Alterações';
    }

    modal.overlay.style.display = 'flex';
}

async function handleResolverPendencia(id) {
    showConfirmModal('Marcar esta pendência como resolvida?', async () => {
        try {
            const response = await fetch(`/api/conferencias/${id}/resolver`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    editor_nome: AppState.currentUser.nome,
                    observacao: 'Resolvido pelo gestor na tela de recebimento.'
                })
            });
            if (!response.ok) throw new Error((await response.json()).error);
            showToast('Pendência resolvida com sucesso!', 'success');
            elementos.editModal.overlay.style.display = 'none';
        } catch (error) {
            showToast(`Erro ao resolver: ${error.message}`, 'error');
        }
    });
}

const handleDelete = (id) => {
    showConfirmModal('Excluir este recebimento? A ação não pode ser desfeita.', async () => {
        try {
            await fetch(`/api/conferencias/${id}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ editor_nome: AppState.currentUser.nome })
            });
            showToast('Recebimento excluído!', 'success');
            elementos.editModal.overlay.style.display = 'none'; // Fecha o modal
        } catch (error) {
            showToast(`Erro ao excluir: ${error.message}`, 'error');
        }
    });
};

async function handleEditFormSubmit(event) {
    event.preventDefault();
    const modal = elementos.editModal;
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

function renderizarTabela() {
    const filtrosColunas = {};
    document.querySelectorAll('.filtro-coluna').forEach(input => {
        filtrosColunas[input.dataset.col] = input.value.toLowerCase().trim();
    });
    const filtroGeral = elementos.filtroGeral.value.toLowerCase().trim();

    const recebimentosFiltrados = todosOsRecebimentos.filter(item => {
        if (filtroGeral && !Object.values(item).some(val => String(val).toLowerCase().includes(filtroGeral))) {
            return false;
        }
        for (const col in filtrosColunas) {
            if (filtrosColunas[col]) {
                const itemValue = col === 'data_recebimento' ? formatarData(item[col]).toLowerCase() : String(item[col]).toLowerCase();
                if (!itemValue.includes(filtrosColunas[col])) {
                    return false;
                }
            }
        }
        return true;
    });

    elementos.tabelaBody.innerHTML = '';
    if (recebimentosFiltrados.length === 0) {
        elementos.tabelaBody.innerHTML = `<tr><td colspan="7">Nenhum recebimento encontrado.</td></tr>`;
        return;
    }

    recebimentosFiltrados.forEach(item => {
        const tr = document.createElement('tr');
        if (item.status === 'Finalizado') {
            tr.classList.add('linha-finalizada');
        }
        const actionButtonText = item.status === 'Pendente de Resolução' ? 'Resolver' : 'Editar';
        const editButton = (AppState.currentUser.role === 'Admin')
            ? `<button class="btn-action btn-edit" data-id="${item.id}">${actionButtonText}</button>`
            : '';

        tr.innerHTML = `
            <td>${formatarData(item.data_recebimento)}</td>
            <td>${item.numero_nota_fiscal}</td>
            <td>${item.nome_fornecedor}</td>
            <td>${item.nome_transportadora}</td>
            <td>${item.qtd_volumes}</td>
            <td>${item.status}</td>
            <td class="actions-cell">${editButton}</td>
        `;
        tr.querySelector('.btn-edit')?.addEventListener('click', () => openEditModal(item));
        elementos.tabelaBody.appendChild(tr);
    });
}

async function handleFormSubmit(event) {
    event.preventDefault();
    const submitBtn = elementos.form.querySelector('button[type="submit"]');
    toggleButtonLoading(submitBtn, true, 'Registrando...');

    const dados = {
        numero_nota_fiscal: document.getElementById('numero-nota-fiscal').value,
        nome_fornecedor: document.getElementById('nome-fornecedor').value,
        nome_transportadora: document.getElementById('nome-transportadora').value,
        qtd_volumes: document.getElementById('qtd-volumes').value,
        editor_nome: AppState.currentUser.nome
    };

    try {
        const response = await fetch('/api/conferencias/recebimento', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados),
        });
        if (!response.ok) throw new Error((await response.json()).error);

        showToast('Recebimento registrado com sucesso!', 'success');
        elementos.form.reset();
        document.getElementById('numero-nota-fiscal').focus();
    } catch (error) {
        showToast(`Erro: ${error.message}`, 'error');
    } finally {
        toggleButtonLoading(submitBtn, false, 'Registrar Entrada');
    }
}

export function initRecebimentoPage() {
    elementos = {
        form: document.getElementById('form-recebimento'),
        tabela: document.getElementById('tabela-recebimentos'),
        tabelaBody: document.getElementById('tabela-recebimentos-body'),
        spinner: document.getElementById('loading-spinner-tabela'),
        filtroGeral: document.getElementById('filtro-geral-recebimentos'),
        editModal: {
            overlay: document.getElementById('edit-recebimento-modal-overlay'),
            form: document.getElementById('form-edit-recebimento'),
            saveButton: document.getElementById('btn-save-edit-recebimento'),
            cancelButton: document.getElementById('btn-cancel-edit-recebimento'),
            btnResolver: document.getElementById('btn-resolver-pendencia'),
            btnExcluir: document.getElementById('btn-excluir-recebimento'),
        }
    };

    // CORREÇÃO: A verificação agora é robusta. Se os elementos não existirem, a função para.
    if (!elementos.form || !elementos.editModal.overlay) {
        // Isso não deve mais acontecer, mas é uma boa prática manter a verificação.
        return;
    }

    elementos.form.addEventListener('submit', handleFormSubmit);
    elementos.editModal.form.addEventListener('submit', handleEditFormSubmit);
    elementos.editModal.cancelButton.addEventListener('click', () => elementos.editModal.overlay.style.display = 'none');
    elementos.editModal.btnResolver.addEventListener('click', () => {
        const id = elementos.editModal.form.dataset.id;
        handleResolverPendencia(id);
    });
    elementos.editModal.btnExcluir.addEventListener('click', () => {
        const id = elementos.editModal.form.dataset.id;
        handleDelete(id);
    });

    const filtros = document.querySelectorAll('.filtro-coluna, #filtro-geral-recebimentos');
    filtros.forEach(input => {
        input.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(renderizarTabela, 300);
        });
    });

    const recebimentosRef = db.ref('conferencias').orderByChild('data_recebimento');
    recebimentosRef.on('value', (snapshot) => {
        elementos.spinner.style.display = 'none';
        elementos.tabela.style.display = 'table';

        const data = snapshot.val() || {};
        todosOsRecebimentos = Object.entries(data).map(([id, value]) => ({ id, ...value }))
            .sort((a, b) => new Date(b.data_recebimento) - new Date(a.data_recebimento));

        renderizarTabela();
    });

    const checkUrlForEdit = () => {
        if (window.location.hash.startsWith('#edit=')) {
            const itemId = window.location.hash.substring(6);
            if (itemId) {
                const itemRef = db.ref(`conferencias/${itemId}`);
                itemRef.once('value', (snapshot) => {
                    if (snapshot.exists()) {
                        const itemData = { id: snapshot.key, ...snapshot.val() };
                        openEditModal(itemData);
                        // Limpa o hash para não reabrir o modal ao atualizar a página
                        history.pushState("", document.title, window.location.pathname + window.location.search);
                    } else {
                        showToast('Item para edição não encontrado.', 'error');
                    }
                });
            }
        }
    };

    // Espera um pouco para os dados do Firebase carregarem antes de checar a URL
    setTimeout(checkUrlForEdit, 1000);
}
