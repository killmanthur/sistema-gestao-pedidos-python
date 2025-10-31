// static/js/pages/admin-sistema.js
import { showToast } from '../toasts.js';
import { showConfirmModal, toggleButtonLoading } from '../ui.js';

const ALL_PAGES = {
    quadro: "Quadro Ativo",
    historico: "Histórico de Pedidos",
    historico_conferencias: "Histórico de Conferências",
    criar_pedido: "Pedidos Rua (Criar)",
    atualizacao_orcamento: "Atualizar Orçamento (Criar)",
    sugestoes: "Sugestão de Compras",
    dashboard: "Dashboard de Compras",
    dashboard_logistica: "Dashboard de Logística",
    recebimento: "Recebimento",
    conferencias: "Quadro de Conferência",
    separacoes: "Separações",
    gerenciar_separacoes: "Gerenciar Separações",
    admin_sistema: "Gerenciar Sistema",
    lixeira: "Lixeira" // Adicionado para completude
};

const SEPARACOES_PERMS = {
    pode_criar_separacao: "Pode Criar",
    pode_editar_separacao: "Pode Editar",
    pode_deletar_separacao: "Pode Excluir",
    pode_enviar_para_conferencia: "Pode Enviar p/ Conferência",
    pode_finalizar_separacao: "Pode Finalizar",
    pode_ver_todas_separacoes: "Vê Todas Separações",
    pode_editar_separacao_finalizada: "Pode Editar Finalizada",
    pode_gerenciar_observacao_separacao: "Pode Gerenciar Observação"
};

const SUGESTOES_PERMS = {
    pode_editar_sugestao_finalizada: "Pode Editar Finalizada"
};

const CONFERENCIAS_PERMS = {
    pode_deletar_conferencia: "Pode Deletar Conferência"
};

// --- INÍCIO DA ALTERAÇÃO ---
const PENDENCIAS_PERMS = {
    pode_editar_pendencia: "Pode Editar Pendências",
    pode_resolver_pendencia_conferencia: "Pode Resolver Pendências (Conferência)",
    pode_reiniciar_conferencia_historico: "Pode Reiniciar Conferência (Histórico)"
};
// --- FIM DA ALTERAÇÃO ---


const LISTAS_DISPONIVEIS = {
    'vendedores': 'Vendedores',
    'compradores': 'Compradores',
    'separadores': 'Separadores (Lista Mestre)',
    'conferentes_estoque': 'Conferentes (Estoque)',
    'conferentes_expedicao': 'Conferentes (Expedição)',
};

let elements = {};
let allUsersData = [];
let currentSort = { key: 'nome', order: 'asc' };
let debounceTimer;

async function carregarListasDropdown() {
    const select = document.getElementById('lista-selecionada');
    select.innerHTML = '<option value="" disabled selected>-- Selecione uma lista --</option>';
    for (const [key, label] of Object.entries(LISTAS_DISPONIVEIS)) {
        select.innerHTML += `<option value="${key}">${label}</option>`;
    }
}

async function carregarItensDaLista(nomeLista) {
    const textarea = document.getElementById('editor-lista-itens');
    const btnSalvar = document.getElementById('btn-salvar-lista');
    textarea.value = 'Carregando...';
    textarea.disabled = true;
    btnSalvar.disabled = true;
    try {
        const response = await fetch(`/api/listas/${nomeLista}`);
        if (!response.ok) throw new Error('Erro ao buscar lista.');
        const itens = await response.json();
        textarea.value = itens.join('\n');
    } catch (error) {
        showToast('Erro ao carregar a lista.', 'error');
        textarea.value = '';
    } finally {
        textarea.disabled = false;
        btnSalvar.disabled = false;
    }
}

async function salvarListaAtual() {
    const nomeLista = document.getElementById('lista-selecionada').value;
    if (!nomeLista) return;
    const btnSalvar = document.getElementById('btn-salvar-lista');
    const textarea = document.getElementById('editor-lista-itens');
    toggleButtonLoading(btnSalvar, true, 'Salvando...');
    const itens = textarea.value.split('\n').map(s => s.trim()).filter(s => s.length > 0);
    try {
        const response = await fetch(`/api/listas/${nomeLista}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ itens: itens })
        });
        if (!response.ok) throw new Error('Falha ao salvar.');
        showToast(`Lista "${LISTAS_DISPONIVEIS[nomeLista]}" atualizada com sucesso!`, 'success');
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        toggleButtonLoading(btnSalvar, false, 'Salvar Lista');
    }
}

async function apiCall(endpoint, method = 'GET', body = null) {
    const options = {
        method,
        headers: { 'Content-Type': 'application/json' }
    };
    if (body) {
        options.body = JSON.stringify(body);
    }
    const response = await fetch(`/api/usuarios${endpoint}`, options);
    if (response.status === 204 || response.headers.get("content-length") === "0") {
        return { status: "success" };
    }
    const result = await response.json();
    if (!response.ok) {
        throw new Error(result.error || `Falha na requisição ${method} ${endpoint}`);
    }
    return result;
}

function renderPermissionsCheckboxes(container, permissionsMap, userPermissions) {
    if (!container) return;
    container.innerHTML = Object.entries(permissionsMap).map(([key, name]) => {
        const isChecked = userPermissions && userPermissions[key] === true;
        return `<label><input type="checkbox" data-key="${key}" ${isChecked ? 'checked' : ''}>${name}</label>`;
    }).join('');
}

function openModal(mode = 'create', user = null) {
    elements.form.reset();
    elements.form.dataset.mode = mode;
    const userPages = user ? user.accessible_pages || [] : [];
    const allPermissions = user ? user.permissions : {};
    renderPermissionsCheckboxes(elements.pagesPermissionsContainer, ALL_PAGES, Object.fromEntries(userPages.map(p => [p, true])));
    renderPermissionsCheckboxes(elements.separacoesPermissionsContainer, SEPARACOES_PERMS, allPermissions);
    renderPermissionsCheckboxes(elements.sugestoesPermissionsContainer, SUGESTOES_PERMS, allPermissions);
    renderPermissionsCheckboxes(elements.conferenciasPermissionsContainer, CONFERENCIAS_PERMS, allPermissions);
    renderPermissionsCheckboxes(elements.pendenciasPermissionsContainer, PENDENCIAS_PERMS, allPermissions);
    if (mode === 'edit') {
        elements.modalTitle.textContent = 'Editar Usuário';
        elements.form.dataset.uid = user.uid;
        document.getElementById('user-uid').value = user.uid;
        document.getElementById('user-nome').value = user.nome;
        document.getElementById('user-email').value = user.email;
        document.getElementById('user-role').value = user.role;
        elements.passwordGroup.style.display = 'none';
        document.getElementById('user-password').required = false;
    } else {
        elements.modalTitle.textContent = 'Criar Novo Usuário';
        elements.form.dataset.uid = '';
        elements.passwordGroup.style.display = 'block';
        document.getElementById('user-password').required = true;
    }
    elements.modal.style.display = 'flex';
}

function closeModal() {
    elements.modal.style.display = 'none';
}

function openSetPasswordModal(user) {
    const modal = document.getElementById('set-password-modal-overlay');
    const form = document.getElementById('form-set-password');
    form.reset();
    form.dataset.uid = user.uid;
    document.getElementById('set-password-user-name').textContent = user.nome;
    modal.style.display = 'flex';
}

function renderTable() {
    const searchTerm = elements.filtroInput.value.toLowerCase().trim();
    const filteredUsers = searchTerm
        ? allUsersData.filter(user =>
            user.nome.toLowerCase().includes(searchTerm) ||
            user.email.toLowerCase().includes(searchTerm) ||
            user.role.toLowerCase().includes(searchTerm)
        )
        : allUsersData;
    filteredUsers.sort((a, b) => {
        const valA = a[currentSort.key]?.toLowerCase() || '';
        const valB = b[currentSort.key]?.toLowerCase() || '';
        if (valA < valB) return currentSort.order === 'asc' ? -1 : 1;
        if (valA > valB) return currentSort.order === 'asc' ? 1 : -1;
        return 0;
    });
    elements.tableBody.innerHTML = '';
    if (!filteredUsers || filteredUsers.length === 0) {
        elements.tableBody.innerHTML = '<tr><td colspan="4">Nenhum usuário encontrado.</td></tr>';
        return;
    }
    filteredUsers.forEach(user => {
        const tr = document.createElement('tr');
        tr.dataset.user = JSON.stringify(allUsersData.find(u => u.uid === user.uid));
        tr.innerHTML = `
            <td>${user.nome}</td>
            <td>${user.email}</td>
            <td>${user.role}</td>
            <td class="actions-cell">
               <button class="btn-action btn-edit">Editar</button>
               <button class="btn-action btn-set-pass">Definir Senha</button>
               <button class="btn-action btn-delete">Excluir</button>
            </td>`;
        elements.tableBody.appendChild(tr);
    });
}

async function fetchAndRenderUsers() {
    elements.spinner.style.display = 'block';
    elements.table.style.display = 'none';
    try {
        allUsersData = await apiCall('', 'GET');
        renderTable();
    } catch (error) {
        showToast(`Erro ao carregar usuários: ${error.message}`, 'error');
    } finally {
        elements.spinner.style.display = 'none';
        elements.table.style.display = 'table';
    }
}

async function handleFormSubmit(event) {
    event.preventDefault();
    toggleButtonLoading(elements.btnSave, true, 'Salvando...');
    const mode = elements.form.dataset.mode;
    const uid = elements.form.dataset.uid;
    const accessible_pages = Array.from(elements.pagesPermissionsContainer.querySelectorAll('input:checked')).map(cb => cb.dataset.key);
    const permissions = {};
    elements.separacoesPermissionsContainer.querySelectorAll('input:checked').forEach(cb => { permissions[cb.dataset.key] = true; });
    elements.sugestoesPermissionsContainer.querySelectorAll('input:checked').forEach(cb => { permissions[cb.dataset.key] = true; });
    elements.conferenciasPermissionsContainer.querySelectorAll('input:checked').forEach(cb => { permissions[cb.dataset.key] = true; });
    elements.pendenciasPermissionsContainer.querySelectorAll('input:checked').forEach(cb => { permissions[cb.dataset.key] = true; });
    const userData = {
        nome: document.getElementById('user-nome').value,
        email: document.getElementById('user-email').value,
        role: document.getElementById('user-role').value,
        accessible_pages: accessible_pages,
        permissions: permissions
    };
    if (mode === 'create') {
        userData.password = document.getElementById('user-password').value;
    }
    try {
        const endpoint = mode === 'create' ? '' : `/${uid}`;
        const method = mode === 'create' ? 'POST' : 'PUT';
        await apiCall(endpoint, method, userData);
        showToast(`Usuário ${mode === 'create' ? 'criado' : 'atualizado'} com sucesso!`, 'success');
        closeModal();
        fetchAndRenderUsers();
    } catch (error) {
        showToast(`Erro: ${error.message}`, 'error');
    } finally {
        toggleButtonLoading(elements.btnSave, false, 'Salvar');
    }
}

function handleTableActions(event) {
    const target = event.target;
    const userRow = target.closest('tr');
    if (!userRow) return;
    const user = JSON.parse(userRow.dataset.user);
    if (target.classList.contains('btn-edit')) {
        openModal('edit', user);
    } else if (target.classList.contains('btn-set-pass')) {
        openSetPasswordModal(user);
    } else if (target.classList.contains('btn-delete')) {
        showConfirmModal(`Excluir o usuário ${user.nome}? Esta ação é permanente.`, async () => {
            try {
                await apiCall(`/${user.uid}`, 'DELETE');
                showToast('Usuário excluído!', 'success');
                fetchAndRenderUsers();
            } catch (error) { showToast(`Erro ao excluir: ${error.message}`, 'error'); }
        });
    }
}

function handleSort(event) {
    const target = event.target;
    if (!target.classList.contains('sortable')) return;
    const sortKey = target.dataset.sort;
    if (currentSort.key === sortKey) {
        currentSort.order = currentSort.order === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.key = sortKey;
        currentSort.order = 'asc';
    }
    document.querySelectorAll('.admin-table th.sortable').forEach(th => { th.classList.remove('asc', 'desc'); });
    target.classList.add(currentSort.order);
    renderTable();
}

async function handleSetPasswordSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const uid = form.dataset.uid;
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    const saveButton = document.getElementById('btn-save-set-password');
    if (newPassword !== confirmPassword) {
        showToast('As senhas não coincidem.', 'error');
        return;
    }
    if (newPassword.length < 6) {
        showToast('A senha deve ter no mínimo 6 caracteres.', 'error');
        return;
    }
    toggleButtonLoading(saveButton, true, 'Salvando...');
    try {
        await apiCall(`/${uid}/set-password`, 'POST', { password: newPassword });
        showToast('Senha alterada com sucesso!', 'success');
        document.getElementById('set-password-modal-overlay').style.display = 'none';
    } catch (error) {
        showToast(`Erro ao alterar a senha: ${error.message}`, 'error');
    } finally {
        toggleButtonLoading(saveButton, false, 'Salvar Nova Senha');
    }
}

export function initAdminSistemaPage() {
    elements = {
        spinner: document.getElementById('loading-spinner-users'),
        table: document.getElementById('users-table'),
        tableBody: document.getElementById('users-table-body'),
        modal: document.getElementById('user-modal-overlay'),
        form: document.getElementById('form-user'),
        modalTitle: document.getElementById('user-modal-title'),
        btnCreate: document.getElementById('btn-create-user'),
        btnSave: document.getElementById('btn-save-user'),
        btnCancel: document.getElementById('btn-cancel-user-modal'),
        passwordGroup: document.getElementById('password-group'),
        pagesPermissionsContainer: document.getElementById('pages-permissions-container'),
        separacoesPermissionsContainer: document.getElementById('separacoes-permissions-container'),
        sugestoesPermissionsContainer: document.getElementById('sugestoes-permissions-container'),
        conferenciasPermissionsContainer: document.getElementById('conferencias-permissions-container'),
        pendenciasPermissionsContainer: document.getElementById('pendencias-permissions-container'),
        filtroInput: document.getElementById('filtro-tabela-usuarios')
    };

    const listaSelect = document.getElementById('lista-selecionada');
    const btnSalvarLista = document.getElementById('btn-salvar-lista');
    if (listaSelect && btnSalvarLista) {
        carregarListasDropdown();
        listaSelect.addEventListener('change', (e) => {
            if (e.target.value) {
                carregarItensDaLista(e.target.value);
            }
        });
        btnSalvarLista.addEventListener('click', salvarListaAtual);
    }

    if (!elements.tableBody) return;

    const setPasswordForm = document.getElementById('form-set-password');
    if (setPasswordForm) {
        setPasswordForm.addEventListener('submit', handleSetPasswordSubmit);
    }
    elements.btnCreate.addEventListener('click', () => openModal('create'));
    elements.tableBody.addEventListener('click', handleTableActions);
    elements.form.addEventListener('submit', handleFormSubmit);
    document.querySelector('.admin-table thead').addEventListener('click', handleSort);
    elements.filtroInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            renderTable();
        }, 300);
    });
    fetchAndRenderUsers();
}