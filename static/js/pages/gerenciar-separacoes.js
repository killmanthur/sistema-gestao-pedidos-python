
// static/js/pages/gerenciar-separacoes.js
import { AppState } from '../state.js';
import { showToast } from '../toasts.js';
import { formatarData, toggleButtonLoading } from '../ui.js';

let elementos = {};
let listasUsuarios = { vendedores: [], separadores: [], expedicao: [] };
let currentPage = 0;
let isLoading = false;
let hasMore = true;
let currentSearchTerm = '';
let debounceTimer;
let autoRefreshInterval = null;

// A lógica de cores e do modal de edição não precisa de alterações
const SEPARATOR_COLORS = ['#2980b9', '#27ae60', '#d35400', '#8e44ad', '#c0392b', '#16a085', '#7f8c8d'];
let colorIndex = 0;
let separatorColorMap = {};

function getSeparatorColor(separatorName) {
    if (!separatorName || separatorName === 'N/A') return null;
    if (!separatorColorMap[separatorName]) {
        separatorColorMap[separatorName] = SEPARATOR_COLORS[colorIndex % SEPARATOR_COLORS.length];
        colorIndex++;
    }
    return separatorColorMap[separatorName];
}

function populateSelect(selectElement, dataList, selectedValue) {
    selectElement.innerHTML = '';
    const placeholder = selectElement.dataset.placeholder || 'Selecione';
    selectElement.innerHTML = `<option value="" disabled>${placeholder}</option>`;

    dataList.forEach(nome => {
        const option = document.createElement('option');
        option.value = nome;
        option.textContent = nome;
        if (nome === selectedValue) {
            option.selected = true;
        }
        selectElement.appendChild(option);
    });
    if (!selectedValue) {
        selectElement.value = "";
    }
}

function openEditModalForManager(separacao) {
    const modalOverlay = document.getElementById('edit-separacao-modal-overlay');
    const form = document.getElementById('form-edit-separacao');
    if (!modalOverlay || !form) return;

    form.dataset.id = separacao.id;
    document.getElementById('edit-numero-movimentacao').value = separacao.numero_movimentacao;
    document.getElementById('edit-qtd-pecas').value = separacao.qtd_pecas || '';
    document.getElementById('edit-nome-cliente').value = separacao.nome_cliente;
    populateSelect(document.getElementById('edit-vendedor-nome'), listasUsuarios.vendedores, separacao.vendedor_nome);

    const separadorContainer = document.getElementById('edit-separador-container');
    separadorContainer.innerHTML = '';
    const separadoresAtuais = separacao.separadores_nomes || [];
    listasUsuarios.separadores.forEach(nome => {
        const isChecked = separadoresAtuais.includes(nome);
        const label = document.createElement('label');
        label.innerHTML = `<input type="checkbox" value="${nome}" ${isChecked ? 'checked' : ''}> ${nome}`;
        separadorContainer.appendChild(label);
    });

    const conferenteSelect = document.getElementById('edit-conferente-nome');
    populateSelect(conferenteSelect, listasUsuarios.expedicao, separacao.conferente_nome);
    conferenteSelect.insertAdjacentHTML('afterbegin', '<option value="">-- Remover Conferente --</option>');
    if (!separacao.conferente_nome) {
        conferenteSelect.value = "";
    }
    modalOverlay.style.display = 'flex';
}

async function handleManagerEditFormSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const saveButton = document.getElementById('btn-save-edit-separacao');
    const movInput = document.getElementById('edit-numero-movimentacao');
    if (movInput.value.length !== 6) {
        showToast('O Nº de Movimentação deve ter exatamente 6 dígitos.', 'error');
        movInput.focus();
        return;
    }
    toggleButtonLoading(saveButton, true, 'Salvando...');
    const separadorContainer = document.getElementById('edit-separador-container');
    const separadoresSelecionados = Array.from(separadorContainer.querySelectorAll('input:checked')).map(cb => cb.value);
    if (separadoresSelecionados.length === 0) {
        showToast('Selecione pelo menos um separador.', 'error');
        toggleButtonLoading(saveButton, false, 'Salvar Alterações');
        return;
    }

    const separacaoId = form.dataset.id;
    const dados = {
        numero_movimentacao: movInput.value,
        nome_cliente: document.getElementById('edit-nome-cliente').value,
        vendedor_nome: document.getElementById('edit-vendedor-nome').value,
        separadores_nomes: separadoresSelecionados,
        conferente_nome: document.getElementById('edit-conferente-nome').value,
        qtd_pecas: document.getElementById('edit-qtd-pecas').value,
        editor_nome: AppState.currentUser.nome,
    };
    try {
        const response = await fetch(`/api/separacoes/${separacaoId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Falha ao salvar.');
        showToast('Separação salva com sucesso!', 'success');
        document.getElementById('edit-separacao-modal-overlay').style.display = 'none';
        await loadTableData(true);
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        toggleButtonLoading(saveButton, false, 'Salvar Alterações');
    }
}

// --- INÍCIO DA FUNÇÃO CORRIGIDA ---
function renderTableRows(separacoes) {
    if (separacoes.length === 0 && currentPage === 0) {
        elementos.tableBody.innerHTML = '<tr><td colspan="8">Nenhuma separação encontrada.</td></tr>';
        return;
    }

    const fragment = document.createDocumentFragment();
    separacoes.forEach(sep => {
        const tr = document.createElement('tr');
        tr.dataset.separacao = JSON.stringify(sep);

        // --- INÍCIO DA ALTERAÇÃO (Badges Coloridas) ---
        let separadoresDisplay = '<span style="color: var(--text-muted);">N/A</span>';

        if (sep.separadores_nomes && sep.separadores_nomes.length > 0) {
            separadoresDisplay = sep.separadores_nomes.map(nome => {
                const color = getSeparatorColor(nome) || '#6c757d'; // Pega cor ou usa cinza padrão
                // Retorna um HTML com estilo inline para a cor de fundo (Badge)
                return `<span style="
                background-color: ${color}; 
                color: white; 
                padding: 3px 8px; 
                border-radius: 12px; 
                font-size: 0.85rem; 
                font-weight: 500;
                display: inline-block; 
                margin: 1px;
                white-space: nowrap;
                text-shadow: 0 1px 1px rgba(0,0,0,0.2);
            ">${nome}</span>`;
            }).join(' ');
        }
        // --- FIM DA ALTERAÇÃO ---

        tr.innerHTML = `
        <td>${sep.numero_movimentacao}</td>
        <td>${sep.nome_cliente}</td>
        <td>${sep.vendedor_nome}</td>
        <td>${separadoresDisplay}</td>
        <td>${sep.conferente_nome || 'N/A'}</td>
        <td>${formatarData(sep.data_criacao)}</td>
        <td>${formatarData(sep.data_finalizacao)}</td>
        <td class="actions-cell">
           <button class="btn-action btn-edit">Editar</button>
        </td>`;
        fragment.appendChild(tr);
    });
    elementos.tableBody.appendChild(fragment);
}
// --- FIM DA FUNÇÃO CORRIGIDA ---

async function loadTableData(reload = false) {
    if (isLoading || (!hasMore && !reload)) return;
    isLoading = true;
    if (reload) {
        currentPage = 0;
        hasMore = true;
        elementos.tableBody.innerHTML = '';
        elementos.spinner.style.display = 'block';
        elementos.table.style.display = 'none';
    } else {
        elementos.loadingMoreSpinner.style.display = 'block';
    }
    try {
        const response = await fetch('/api/separacoes/tabela-paginada', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                page: currentPage,
                search: currentSearchTerm
            })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Falha ao buscar dados.');
        renderTableRows(data.separacoes);
        hasMore = data.temMais;
        currentPage++;
    } catch (error) {
        showToast(`Erro ao carregar dados: ${error.message}`, 'error');
    } finally {
        isLoading = false;
        elementos.spinner.style.display = 'none';
        elementos.table.style.display = 'table';
        elementos.loadingMoreSpinner.style.display = 'none';
    }
}

async function fetchInitialUserData() {
    try {
        const [vendedoresRes, separadoresRes, expedicaoRes] = await Promise.all([
            fetch('/api/usuarios/vendedor-nomes'),
            fetch('/api/usuarios/separador-nomes'),
            fetch('/api/usuarios/expedicao-nomes')
        ]);
        listasUsuarios.vendedores = await vendedoresRes.json();
        const todosSeparadores = await separadoresRes.json();
        listasUsuarios.separadores = todosSeparadores.filter(nome => nome.toLowerCase() !== 'separacao');
        listasUsuarios.expedicao = await expedicaoRes.json();
    } catch (error) {
        showToast('Erro ao carregar listas de usuários.', 'error');
    }
}

function handleTableActions(event) {
    const target = event.target;
    if (!target.classList.contains('btn-edit')) return;
    const row = target.closest('tr');
    if (!row || !row.dataset.separacao) return;
    const separacao = JSON.parse(row.dataset.separacao);
    openEditModalForManager(separacao);
}

function startAutoRefresh() {
    if (autoRefreshInterval) clearInterval(autoRefreshInterval);
    autoRefreshInterval = setInterval(async () => {
        if (currentSearchTerm === '' && window.scrollY < 100) {
            console.log("Atualizando automaticamente a tabela de gerenciamento...");
            await loadTableData(true);
        }
    }, 15000);
}

export async function initGerenciarSeparacoesPage() {
    elementos = {
        spinner: document.getElementById('loading-spinner-tabela'),
        loadingMoreSpinner: document.getElementById('loading-more-spinner'),
        table: document.getElementById('tabela-separacoes'),
        tableBody: document.getElementById('tabela-separacoes-body'),
        filtroInput: document.getElementById('filtro-tabela-separacoes'),
    };
    const editForm = document.getElementById('form-edit-separacao');
    const cancelEditBtn = document.getElementById('btn-cancel-edit-separacao');

    if (!elementos.tableBody) return;

    elementos.tableBody.addEventListener('click', handleTableActions);
    elementos.filtroInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        if (autoRefreshInterval) clearInterval(autoRefreshInterval);
        debounceTimer = setTimeout(() => {
            currentSearchTerm = elementos.filtroInput.value;
            loadTableData(true);
            startAutoRefresh();
        }, 500);
    });

    window.addEventListener('scroll', () => {
        if (isLoading || !hasMore) return;
        const isNearBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 200;
        if (isNearBottom) {
            loadTableData();
        }
    });

    if (editForm) {
        editForm.addEventListener('submit', handleManagerEditFormSubmit);
    }
    if (cancelEditBtn) {
        cancelEditBtn.addEventListener('click', () => {
            document.getElementById('edit-separacao-modal-overlay').style.display = 'none';
        });
    }

    await fetchInitialUserData();
    await loadTableData(true);
    startAutoRefresh();
}