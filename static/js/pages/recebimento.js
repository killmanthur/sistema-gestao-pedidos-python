// static/js/pages/recebimento.js
import { AppState } from '../state.js';
import { showToast } from '../toasts.js';
import { toggleButtonLoading, formatarData, showConfirmModal } from '../ui.js';

let elementos = {};
let todosOsRecebimentos = [];
let debounceTimer;
let listaDeVendedores = [];
let intervalId = null;

async function fetchAndPopulateVendors(selectElement) {
    if (listaDeVendedores.length === 0) {
        try {
            // --- MUDANÇA AQUI ---
            // Chama a nova rota específica que inclui "Estoque"
            const response = await fetch('/api/usuarios/destinos-rua');
            if (!response.ok) throw new Error('Falha ao buscar destinos de nota da rua.');
            listaDeVendedores = await response.json();
        } catch (error) {
            showToast(error.message, 'error');
            return;
        }
    }
    selectElement.innerHTML = '<option value="" disabled selected>Selecione um destino</option>';
    listaDeVendedores.forEach(nome => {
        selectElement.innerHTML += `<option value="${nome}">${nome}</option>`;
    });
}

function openEditModal(item) {
    const modal = elementos.editModal;
    modal.form.dataset.id = item.id;
    modal.form.querySelector('#edit-numero-nota-fiscal').value = item.numero_nota_fiscal;
    modal.form.querySelector('#edit-nome-fornecedor').value = item.nome_fornecedor;
    modal.form.querySelector('#edit-qtd-volumes').value = item.qtd_volumes;
    modal.form.querySelector('#edit-recebido-por').value = item.recebido_por || '';


    const transportadoraGroup = document.getElementById('edit-transportadora-group');
    const vendedorGroup = document.getElementById('edit-vendedor-group');

    if (item.vendedor_nome) { // É nota da rua
        transportadoraGroup.style.display = 'none';
        vendedorGroup.style.display = 'block';
        const vendedorSelect = document.getElementById('edit-nome-vendedor');
        // Também usa a nova função aqui para garantir consistência
        fetchAndPopulateVendors(vendedorSelect).then(() => {
            vendedorSelect.value = item.vendedor_nome;
        });
    } else { // É nota de fornecedor
        transportadoraGroup.style.display = 'block';
        vendedorGroup.style.display = 'none';
        modal.form.querySelector('#edit-nome-transportadora').value = item.nome_transportadora;
    }

    const perms = AppState.currentUser.permissions || {};
    modal.btnExcluir.style.display = perms.pode_deletar_conferencia ? 'inline-block' : 'none';
    modal.overlay.style.display = 'flex';
}

// ... (O restante do arquivo permanece exatamente o mesmo, pois as outras lógicas não precisam ser alteradas)

async function handleEditFormSubmit(event) {
    event.preventDefault();
    const modal = elementos.editModal;
    const id = modal.form.dataset.id;
    const saveButton = modal.saveButton;
    toggleButtonLoading(saveButton, true, 'Salvando...');

    const dados = {
        numero_nota_fiscal: modal.form.querySelector('#edit-numero-nota-fiscal').value,
        nome_fornecedor: modal.form.querySelector('#edit-nome-fornecedor').value,
        qtd_volumes: modal.form.querySelector('#edit-qtd-volumes').value,
        recebido_por: modal.form.querySelector('#edit-recebido-por').value,
        editor_nome: AppState.currentUser.nome,
    };

    const isRua = document.getElementById('edit-vendedor-group').style.display === 'block';
    if (isRua) {
        dados.vendedor_nome = document.getElementById('edit-nome-vendedor').value;
    } else {
        dados.nome_transportadora = document.getElementById('edit-nome-transportadora').value;
    }

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
    showConfirmModal('Excluir este recebimento? A ação não pode ser desfeita.', async () => {
        try {
            await fetch(`/api/conferencias/${id}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ editor_nome: AppState.currentUser.nome })
            });
            showToast('Recebimento excluído!', 'success');
            const openModal = document.querySelector('.modal-overlay[style*="display: flex"]');
            if (openModal) openModal.style.display = 'none';
        } catch (error) {
            showToast(`Erro ao excluir: ${error.message}`, 'error');
        }
    });
};

function renderizarTabela() {
    const filtrosColunas = {};
    document.querySelectorAll('.filtro-coluna').forEach(input => {
        const colKey = input.dataset.col === 'transportadora_ou_vendedor' ? ['nome_transportadora', 'vendedor_nome'] : [input.dataset.col];
        filtrosColunas[input.dataset.col] = { value: input.value.toLowerCase().trim(), keys: colKey };
    });
    const filtroGeral = elementos.filtroGeral.value.toLowerCase().trim();

    const recebimentosFiltrados = todosOsRecebimentos.filter(item => {
        const searchableValues = Object.values(item).concat(item.vendedor_nome || '');
        if (filtroGeral && !searchableValues.some(val => String(val).toLowerCase().includes(filtroGeral))) {
            return false;
        }
        for (const colName in filtrosColunas) {
            const filtro = filtrosColunas[colName];
            if (filtro.value) {
                const itemHasMatch = filtro.keys.some(key => {
                    const itemValue = key === 'data_recebimento' ? formatarData(item[key]).toLowerCase() : String(item[key] || '').toLowerCase();
                    return itemValue.includes(filtro.value);
                });
                if (!itemHasMatch) return false;
            }
        }
        return true;
    });

    elementos.tabelaBody.innerHTML = '';
    if (recebimentosFiltrados.length === 0) {
        elementos.tabelaBody.innerHTML = `<tr><td colspan="8">Nenhum recebimento encontrado.</td></tr>`;
        return;
    }

    recebimentosFiltrados.forEach(item => {
        const tr = document.createElement('tr');
        if (item.status === 'Finalizado') {
            tr.classList.add('linha-finalizada');
        }

        const perms = AppState.currentUser.permissions || {};
        let actionsHTML = '';

        const rolesPermitidasParaEdicao = ['Admin', 'Estoque', 'Recepção', 'Contabilidade'];
        if (rolesPermitidasParaEdicao.includes(AppState.currentUser.role)) {
            actionsHTML += `<button class="btn-action btn-edit" data-id="${item.id}">Editar</button>`;
        }

        if (perms.pode_deletar_conferencia) {
            actionsHTML += `<button class="btn-action btn-delete btn-delete--icon" data-id="${item.id}" title="Excluir">X</button>`;
        }

        const transportadoraCell = item.vendedor_nome
            ? `<span style="font-weight: bold; color: var(--clr-info);">[RUA] Destino: ${item.vendedor_nome}</span>`
            : item.nome_transportadora;

        tr.innerHTML = `
            <td>${formatarData(item.data_recebimento)}</td>
            <td>${item.numero_nota_fiscal}</td>
            <td>${item.nome_fornecedor}</td>
            <td>${transportadoraCell}</td>
            <td>${item.qtd_volumes}</td>
            <td>${item.recebido_por || ''}</td>
            <td>${item.status}</td>
            <td class="actions-cell">${actionsHTML}</td>
        `;
        tr.querySelector('.btn-edit')?.addEventListener('click', () => openEditModal(item));
        tr.querySelector('.btn-delete')?.addEventListener('click', (e) => handleDelete(e.target.dataset.id));
        elementos.tabelaBody.appendChild(tr);
    });
}

async function handleFornecedorFormSubmit(event) {
    event.preventDefault();
    const modal = elementos.modalFornecedor;
    const submitBtn = modal.form.querySelector('button[type="submit"]');
    toggleButtonLoading(submitBtn, true, 'Registrando...');

    const dados = {
        numero_nota_fiscal: document.getElementById('fornecedor-numero-nota').value,
        nome_fornecedor: document.getElementById('fornecedor-nome').value,
        nome_transportadora: document.getElementById('fornecedor-transportadora').value,
        qtd_volumes: document.getElementById('fornecedor-qtd-volumes').value,
        recebido_por: document.getElementById('fornecedor-recebido-por').value,
        editor_nome: AppState.currentUser.nome
    };

    try {
        const response = await fetch('/api/conferencias/recebimento', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados),
        });
        if (!response.ok) throw new Error((await response.json()).error);
        showToast('Recebimento de fornecedor registrado!', 'success');
        modal.form.reset();
        modal.overlay.style.display = 'none';
    } catch (error) {
        showToast(`Erro: ${error.message}`, 'error');
    } finally {
        toggleButtonLoading(submitBtn, false, 'Registrar Entrada');
    }
}

async function handleRuaFormAction(actionType, event) {
    const modal = elementos.modalRua;
    const btn = event.target;
    const observacao = modal.obsInput.value.trim();

    if (actionType === 'alteracao' && !observacao) {
        showToast('A observação é obrigatória para solicitar alteração.', 'error');
        return;
    }

    toggleButtonLoading(btn, true, 'Salvando...');

    const dadosRecebimento = {
        numero_nota_fiscal: document.getElementById('rua-numero-nota').value,
        nome_fornecedor: document.getElementById('rua-nome-fornecedor').value,
        vendedor_nome: document.getElementById('rua-nome-vendedor').value,
        qtd_volumes: document.getElementById('rua-qtd-volumes').value,
        recebido_por: document.getElementById('rua-recebido-por').value,
        editor_nome: AppState.currentUser.nome,
        solicita_alteracao: actionType === 'alteracao',
        tem_pendencia_fornecedor: false,
        observacao: observacao,
    };

    try {
        const response = await fetch('/api/conferencias/recebimento-rua', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dadosRecebimento),
        });
        if (!response.ok) throw new Error((await response.json()).error);
        showToast('Nota da Rua registrada com sucesso!', 'success');
        modal.form.reset();
        modal.overlay.style.display = 'none';
    } catch (error) {
        showToast(`Erro: ${error.message}`, 'error');
    } finally {
        toggleButtonLoading(btn, false, btn.textContent);
    }
}

async function fetchData() {
    try {
        const response = await fetch('/api/conferencias/recentes');
        if (!response.ok) throw new Error('Falha ao buscar recebimentos.');

        todosOsRecebimentos = await response.json();
        renderizarTabela();

        elementos.spinner.style.display = 'none';
        elementos.tabela.style.display = 'table';
    } catch (error) {
        console.error("Erro ao buscar recebimentos:", error);
        showToast(error.message, 'error');
        if (intervalId) clearInterval(intervalId);
    }
}

function startAutoRefresh() {
    if (intervalId) clearInterval(intervalId);
    intervalId = setInterval(fetchData, 3000);
}

export function initRecebimentoPage() {
    elementos = {
        btnAbrirModalFornecedor: document.getElementById('btn-abrir-modal-fornecedor'),
        btnAbrirModalRua: document.getElementById('btn-abrir-modal-rua'),
        modalFornecedor: {
            overlay: document.getElementById('modal-fornecedor-overlay'),
            form: document.getElementById('form-nota-fornecedor'),
        },
        modalRua: {
            overlay: document.getElementById('modal-rua-overlay'),
            form: document.getElementById('form-nota-rua'),
            obsInput: document.getElementById('rua-observacao'),
            btnFinalizeOk: document.getElementById('btn-rua-finalize-ok'),
            btnSolicitarAlteracao: document.getElementById('btn-rua-solicitar-alteracao'),
        },
        tabela: document.getElementById('tabela-recebimentos'),
        tabelaBody: document.getElementById('tabela-recebimentos-body'),
        spinner: document.getElementById('loading-spinner-tabela'),
        filtroGeral: document.getElementById('filtro-geral-recebimentos'),
        editModal: {
            overlay: document.getElementById('edit-recebimento-modal-overlay'),
            form: document.getElementById('form-edit-recebimento'),
            saveButton: document.getElementById('btn-save-edit-recebimento'),
            btnExcluir: document.getElementById('btn-excluir-recebimento'),
        }
    };

    if (!elementos.btnAbrirModalFornecedor) return;

    elementos.btnAbrirModalFornecedor.addEventListener('click', () => {
        elementos.modalFornecedor.overlay.style.display = 'flex';
    });
    elementos.btnAbrirModalRua.addEventListener('click', () => {
        fetchAndPopulateVendors(document.getElementById('rua-nome-vendedor'));
        elementos.modalRua.overlay.style.display = 'flex';
    });

    elementos.modalFornecedor.form.addEventListener('submit', handleFornecedorFormSubmit);

    elementos.modalRua.btnSolicitarAlteracao.addEventListener('click', (e) => {
        e.preventDefault();
        handleRuaFormAction('alteracao', e);
    });
    elementos.modalRua.btnFinalizeOk.addEventListener('click', (e) => {
        e.preventDefault();
        handleRuaFormAction('ok', e);
    });

    if (elementos.editModal.form) {
        elementos.editModal.form.addEventListener('submit', handleEditFormSubmit);
        elementos.editModal.btnExcluir.addEventListener('click', () => {
            const id = elementos.editModal.form.dataset.id;
            handleDelete(id);
        });
    }

    const filtros = document.querySelectorAll('.filtro-coluna, #filtro-geral-recebimentos');
    filtros.forEach(input => {
        input.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(renderizarTabela, 300);
        });
    });

    fetchData();
    startAutoRefresh();
}