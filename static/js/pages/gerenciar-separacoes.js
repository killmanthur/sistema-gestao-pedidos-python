// static/js/pages/gerenciar-separacoes.js
import { AppState } from '../state.js';
import { showToast } from '../toasts.js';
import { formatarData, toggleButtonLoading } from '../ui.js';

// --- VARIÁVEIS DE CONTROLE DO MÓDULO ---
let elementos = {};
let listasUsuarios = { vendedores: [], separadores: [], expedicao: [] };
let currentPage = 0;
let isLoading = false;
let hasMore = true;
let currentSearchTerm = '';
let debounceTimer;
let lastProcessedNum = null;
let mostrandoApenasFalhas = false;
let maxMovGlobal = 0;
let separatorColorMap = {};
let filaAtiva = [];
let selecionadosNoForm = [];
let tagInput = null;
let vendedorInput = null;

// --- TAG INPUT COM AUTOCOMPLETE ---
function createTagInput(container, getOptions, { single = false, onSync } = {}) {
    const input = container.querySelector('.tag-input-field');
    const suggestionsList = container.querySelector('.tag-suggestions');
    const selected = [];
    let activeIndex = -1;

    container.addEventListener('click', () => input.focus());

    function render() {
        container.querySelectorAll('.tag-chip').forEach(c => c.remove());
        selected.forEach((name, i) => {
            const chip = document.createElement('span');
            chip.className = 'tag-chip';
            chip.innerHTML = `${name} <button class="tag-remove" data-index="${i}" type="button">&times;</button>`;
            container.insertBefore(chip, input);
        });
        if (single) input.style.display = selected.length > 0 ? 'none' : '';
        if (onSync) onSync([...selected]);
    }

    function showSuggestions() {
        const query = input.value.trim().toLowerCase();
        const options = getOptions().filter(n => !selected.includes(n) && (!query || n.toLowerCase().includes(query)));
        activeIndex = -1;
        if (options.length === 0 || !query) {
            suggestionsList.innerHTML = '';
            suggestionsList.classList.remove('open');
            return;
        }
        suggestionsList.innerHTML = options.map(n => `<li data-value="${n}">${n}</li>`).join('');
        suggestionsList.classList.add('open');
    }

    function addTag(name) {
        if (single) selected.length = 0;
        if (!selected.includes(name)) {
            selected.push(name);
            render();
        }
        input.value = '';
        suggestionsList.innerHTML = '';
        suggestionsList.classList.remove('open');
        if (!single) input.focus();
    }

    function removeTag(index) {
        selected.splice(index, 1);
        render();
        input.focus();
    }

    input.addEventListener('input', showSuggestions);

    input.addEventListener('keydown', (e) => {
        const items = suggestionsList.querySelectorAll('li');
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            activeIndex = Math.min(activeIndex + 1, items.length - 1);
            items.forEach((li, i) => li.classList.toggle('active', i === activeIndex));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            activeIndex = Math.max(activeIndex - 1, 0);
            items.forEach((li, i) => li.classList.toggle('active', i === activeIndex));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (activeIndex >= 0 && items[activeIndex]) {
                addTag(items[activeIndex].dataset.value);
            } else if (items.length === 1) {
                addTag(items[0].dataset.value);
            }
        } else if (e.key === 'Escape') {
            suggestionsList.innerHTML = '';
            suggestionsList.classList.remove('open');
        } else if (e.key === 'Backspace' && !input.value && selected.length > 0) {
            removeTag(selected.length - 1);
        }
    });

    suggestionsList.addEventListener('click', (e) => {
        const li = e.target.closest('li');
        if (li) addTag(li.dataset.value);
    });

    container.addEventListener('click', (e) => {
        const btn = e.target.closest('.tag-remove');
        if (btn) removeTag(parseInt(btn.dataset.index));
    });

    document.addEventListener('click', (e) => {
        if (!container.contains(e.target)) {
            suggestionsList.innerHTML = '';
            suggestionsList.classList.remove('open');
        }
    });

    return {
        get selected() { return [...selected]; },
        get value() { return selected[0] || ''; },
        clear() { selected.length = 0; render(); input.value = ''; },
        focus() { input.focus(); }
    };
}

// --- FUNÇÕES AUXILIARES ---

function getSeparatorColor(separatorName) {
    const SEPARATOR_COLORS = ['#2980b9', '#27ae60', '#d35400', '#8e44ad', '#c0392b', '#16a085', '#7f8c8d'];
    if (!separatorName || separatorName === 'N/A') return '#6c757d';
    if (!separatorColorMap[separatorName]) {
        let hash = 0;
        for (let i = 0; i < separatorName.length; i++) {
            hash = separatorName.charCodeAt(i) + ((hash << 5) - hash);
        }
        const colorIndex = Math.abs(hash % SEPARATOR_COLORS.length);
        separatorColorMap[separatorName] = SEPARATOR_COLORS[colorIndex];
    }
    return separatorColorMap[separatorName];
}

function populateSelect(selectElement, dataList, selectedValue) {
    selectElement.innerHTML = '<option value="">Selecione</option>';
    if (selectElement.id === 'edit-conferente-nome') {
         selectElement.insertAdjacentHTML('beforeend', '<option value="">-- Remover Conferente --</option>');
    }
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


// --- LÓGICA PRINCIPAL DA PÁGINA ---

function renderTableRows(separacoes) {
    const fragment = document.createDocumentFragment();
    const PONTO_DE_CORTE = 384800;

    separacoes.forEach(sep => {
        const currentNum = parseInt(sep.numero_movimentacao, 10);
        if (!currentSearchTerm && currentNum > maxMovGlobal) maxMovGlobal = currentNum;

        if (lastProcessedNum !== null && (lastProcessedNum - currentNum) > 1 && lastProcessedNum > PONTO_DE_CORTE) {
            for (let i = lastProcessedNum - 1; i > currentNum; i--) {
                const trGhost = document.createElement('tr');
                trGhost.className = 'error-row';
                trGhost.style.backgroundColor = 'rgba(255, 80, 80, 0.15)';
                trGhost.innerHTML = `<td colspan="8" style="color: #ff5050; font-weight: bold; text-align: center;">ERRO: MOVIMENTAÇÃO ${i} NÃO ENCONTRADA / PULADA</td>`;
                fragment.appendChild(trGhost);
            }
        }

        const tr = document.createElement('tr');
        tr.dataset.separacao = JSON.stringify(sep);

        const separadoresDisplay = (sep.separadores_nomes && sep.separadores_nomes.length > 0)
            ? sep.separadores_nomes.map(nome => {
                const color = getSeparatorColor(nome);
                return `<span class="badge" style="background-color: ${color};">${nome}</span>`;
            }).join(' ') // <--- ADICIONADO UM ESPAÇO AQUI
            : '<span style="color: var(--text-muted);">N/A</span>';


        tr.innerHTML = `
            <td>${sep.numero_movimentacao}</td>
            <td>${sep.nome_cliente || ''}</td>
            <td>${sep.vendedor_nome || ''}</td>
            <td><div class="badge-container">${separadoresDisplay}</div></td>
            <td>${sep.conferente_nome || 'N/A'}</td>
            <td>${formatarData(sep.data_criacao)}</td>
            <td>${formatarData(sep.data_finalizacao)}</td>
            <td class="actions-cell">
               <button class="btn-action btn-edit">Editar</button>
            </td>`;
        
        fragment.appendChild(tr);
        lastProcessedNum = currentNum;
    });

    elementos.tableBody.appendChild(fragment);
}

async function loadTableData(reload = false) {
    if (isLoading) return;
    if (!reload && !hasMore) return;

    isLoading = true;

    if (reload) {
        currentPage = 0;
        hasMore = true;
        lastProcessedNum = null;
        if (!currentSearchTerm) maxMovGlobal = 0;
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
            body: JSON.stringify({ page: currentPage, search: currentSearchTerm, limit: 50 })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Erro do servidor');

        if (data.separacoes && data.separacoes.length > 0) {
            renderTableRows(data.separacoes);
            hasMore = data.temMais;
            currentPage++;
        } else {
            hasMore = false;
            if (currentPage === 0) {
                elementos.tableBody.innerHTML = '<tr><td colspan="8">Nenhuma separação encontrada.</td></tr>';
            }
        }
    } catch (error) {
        console.error("Erro ao carregar dados da tabela:", error);
        showToast(`Falha ao carregar dados: ${error.message}`, 'error');
        elementos.tableBody.innerHTML = '<tr><td colspan="8" style="color:red;">Erro ao carregar os dados.</td></tr>';
    } finally {
        isLoading = false;
        elementos.spinner.style.display = 'none';
        elementos.table.style.display = 'table';
        elementos.loadingMoreSpinner.style.display = 'none';
    }
}

function toggleExibirApenasFalhas() {
    mostrandoApenasFalhas = !mostrandoApenasFalhas;
    const btn = document.getElementById('btn-buscar-falhas');
    const rows = Array.from(elementos.tableBody.querySelectorAll('tr'));
    let falhasEncontradas = false;

    rows.forEach(row => {
        const isErrorRow = row.classList.contains('error-row');
        if (mostrandoApenasFalhas) {
            row.style.display = isErrorRow ? '' : 'none';
        } else {
            row.style.display = '';
        }
        if (isErrorRow) falhasEncontradas = true;
    });

    if (mostrandoApenasFalhas) {
        btn.textContent = 'Mostrar Todas';
        btn.classList.add('active');
        if (!falhasEncontradas) {
            showToast('Nenhuma falha de sequência visível na lista carregada.', 'info');
        }
    } else {
        btn.textContent = 'Identificar Pulantes';
        btn.classList.remove('active');
    }
}

// --- FUNÇÕES DE MODAL E FORMULÁRIO ---

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
        separadorContainer.insertAdjacentHTML('beforeend', `<label><input type="checkbox" value="${nome}" ${isChecked ? 'checked' : ''}> ${nome}</label>`);
    });

    populateSelect(document.getElementById('edit-conferente-nome'), listasUsuarios.expedicao, separacao.conferente_nome);
    modalOverlay.style.display = 'flex';
}

// ****** ESTA É A FUNÇÃO QUE ESTAVA FALTANDO ******
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
    const separadoresSelecionados = Array.from(form.querySelectorAll('#edit-separador-container input:checked')).map(cb => cb.value);

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
        await loadTableData(true); // Recarrega a tabela para refletir a mudança
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        toggleButtonLoading(saveButton, false, 'Salvar Alterações');
    }
}


// --- FUNÇÕES DE FILA (GERENCIAMENTO) ---
async function fetchAndRenderFila() {
    try {
        const res = await fetch('/api/separacoes/fila-separadores');
        const fila = await res.json();
        filaAtiva = fila;
        const lista = document.getElementById('fila-separadores-lista');
        if (lista) {
            lista.innerHTML = fila.length ? fila.map((n, i) => `<li class="${i === 0 ? 'proximo-separador' : ''}">${n}</li>`).join('') : '<li>Nenhum separador na fila</li>';
        }
    } catch (e) { console.error(e); }
}

async function openFilaModal() {
    const modal = elementos.gerenciarFilaModal;
    const container = modal.checkboxContainer;
    modal.overlay.style.display = 'flex';
    container.innerHTML = '<div class="spinner" style="margin: 1rem auto;"></div>';

    try {
        const response = await fetch('/api/separacoes/status-todos-separadores');
        if (!response.ok) throw new Error('Falha ao buscar a lista de separadores.');
        const separadores = await response.json();

        container.innerHTML = '';
        if (separadores.length === 0) {
            container.innerHTML = '<p>Nenhum usuário com a função "Separador" encontrado.</p>';
            return;
        }

        separadores.forEach(sep => {
            const label = document.createElement('label');
            label.innerHTML = `<input type="checkbox" value="${sep.nome}" ${sep.ativo ? 'checked' : ''}> ${sep.nome}`;
            container.appendChild(label);
        });
    } catch (error) {
        showToast(error.message, 'error');
        container.innerHTML = `<p style="color: var(--clr-danger);">${error.message}</p>`;
    }
}

async function handleSaveFila(event) {
    event.preventDefault();
    const modal = elementos.gerenciarFilaModal;
    const saveBtn = modal.saveButton;
    toggleButtonLoading(saveBtn, true, 'Salvando...');

    const checkboxes = modal.checkboxContainer.querySelectorAll('input[type="checkbox"]:checked');
    const nomesAtivos = Array.from(checkboxes).map(cb => cb.value);

    try {
        const response = await fetch('/api/separacoes/fila-separadores', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(nomesAtivos),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Falha ao salvar a fila.');
        }

        showToast('Fila de separação atualizada com sucesso!', 'success');
        modal.overlay.style.display = 'none';
        await fetchAndRenderFila();
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        toggleButtonLoading(saveBtn, false, 'Salvar Alterações');
    }
}

// --- SUGESTÃO Nº MOVIMENTAÇÃO (ghost text + Tab) ---
let sugestaoMov = null;

function calcularProximaMov() {
    return maxMovGlobal > 0 ? String(maxMovGlobal + 1) : null;
}

function setupMovSugestao() {
    const input = document.getElementById('numero-movimentacao');
    if (!input) return;

    // Wrapper para posicionar o ghost text
    const wrapper = document.createElement('div');
    wrapper.className = 'mov-suggestion-wrapper';
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);

    const ghost = document.createElement('span');
    ghost.className = 'mov-ghost-text';
    wrapper.appendChild(ghost);

    function updateGhost() {
        sugestaoMov = calcularProximaMov();
        const val = input.value;
        if (sugestaoMov && !val) {
            ghost.innerHTML = `<span class="ghost-rest">${sugestaoMov}</span>`;
        } else if (sugestaoMov && sugestaoMov.startsWith(val) && val.length < sugestaoMov.length) {
            ghost.innerHTML = `<span class="ghost-typed">${val}</span><span class="ghost-rest">${sugestaoMov.slice(val.length)}</span>`;
        } else {
            ghost.innerHTML = '';
        }
    }

    input.addEventListener('input', updateGhost);
    input.addEventListener('focus', updateGhost);
    input.addEventListener('blur', () => { ghost.innerHTML = ''; });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Tab' && sugestaoMov && input.value !== sugestaoMov) {
            e.preventDefault();
            input.value = sugestaoMov;
            ghost.innerHTML = '';
        }
    });

    updateGhost();
}

// --- NAVEGAÇÃO: ESC volta para campo anterior ---
function setupEscNavigation() {
    const form = document.getElementById('form-separacao');
    if (!form) return;
    form.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const focusables = [...form.querySelectorAll('input:not([type="hidden"]), select, .tag-input-field')].filter(el => el.offsetParent !== null);
        const idx = focusables.indexOf(document.activeElement);
        if (idx > 0) {
            e.preventDefault();
            focusables[idx - 1].focus();
        }
    });
}

function autoPreencherMovimentacao() {
    // Atualiza a sugestão ghost quando dados mudam
    const input = document.getElementById('numero-movimentacao');
    if (input) input.dispatchEvent(new Event('focus'));
}

// --- CRIAÇÃO DE SEPARAÇÃO ---
async function handleFormSubmit(e) {
    e.preventDefault();
    const mov = document.getElementById('numero-movimentacao').value;
    if (mov.length !== 6) return showToast('Nº Movimentação deve ter 6 dígitos', 'error');
    const separadoresSelecionados = tagInput ? tagInput.selected : selecionadosNoForm;
    if (separadoresSelecionados.length === 0) return showToast('Selecione ao menos um separador', 'error');

    const vendedorNome = vendedorInput ? vendedorInput.value : document.getElementById('vendedor-nome')?.value;
    if (!vendedorNome) return showToast('Selecione um vendedor', 'error');

    const body = {
        numero_movimentacao: mov,
        qtd_pecas: document.getElementById('qtd-pecas').value,
        nome_cliente: document.getElementById('nome-cliente').value,
        vendedor_nome: vendedorNome,
        separadores_nomes: separadoresSelecionados,
        editor_nome: AppState.currentUser.nome
    };
    const res = await fetch('/api/separacoes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (res.ok) {
        showToast('Separação criada com sucesso!', 'success');
        elementos.formSeparacao.reset();
        selecionadosNoForm = [];
        if (tagInput) tagInput.clear();
        if (vendedorInput) vendedorInput.clear();
        autoPreencherMovimentacao();
        await Promise.all([fetchAndRenderFila(), loadTableData(true)]);
    } else {
        const err = await res.json();
        showToast(err.error, 'error');
    }
}

// --- INICIALIZAÇÃO E EVENTOS ---

async function fetchInitialUserData() {
    try {
        const [vendedoresRes, separadoresRes, expedicaoRes] = await Promise.all([
            fetch('/api/usuarios/vendedor-nomes'),
            fetch('/api/usuarios/separador-nomes'),
            fetch('/api/usuarios/expedicao-nomes')
        ]);
        listasUsuarios.vendedores = await vendedoresRes.json();
        listasUsuarios.separadores = (await separadoresRes.json()).filter(n => n.toLowerCase() !== 'separacao');
        listasUsuarios.expedicao = await expedicaoRes.json();
    } catch (error) {
        showToast('Erro ao carregar listas de usuários.', 'error');
    }
}

function handleTableActions(event) {
    const target = event.target.closest('.btn-edit');
    if (!target) return;
    const row = target.closest('tr');
    if (row && row.dataset.separacao) {
        openEditModalForManager(JSON.parse(row.dataset.separacao));
    }
}

export async function initGerenciarSeparacoesPage() {
    elementos = {
        spinner: document.getElementById('loading-spinner-tabela'),
        loadingMoreSpinner: document.getElementById('loading-more-spinner'),
        table: document.getElementById('tabela-separacoes'),
        tableBody: document.getElementById('tabela-separacoes-body'),
        filtroInput: document.getElementById('filtro-tabela-separacoes'),
        formSeparacao: document.getElementById('form-separacao'),
        tagInputContainer: document.getElementById('separadores-tag-input'),
        vendedorTagContainer: document.getElementById('vendedor-tag-input'),
        gerenciarFilaModal: {
            overlay: document.getElementById('gerenciar-fila-modal-overlay'),
            form: document.getElementById('form-gerenciar-fila'),
            checkboxContainer: document.getElementById('fila-checkbox-container'),
            saveButton: document.getElementById('btn-save-fila'),
            btnGerenciar: document.getElementById('btn-gerenciar-fila')
        }
    };

    if (!elementos.tableBody) return;

    // Listeners de Ações da Tabela
    elementos.tableBody.addEventListener('click', handleTableActions);
    document.getElementById('form-edit-separacao')?.addEventListener('submit', handleManagerEditFormSubmit);
    document.getElementById('btn-buscar-falhas').addEventListener('click', toggleExibirApenasFalhas);

    // Tag Input de Separadores (Criação)
    if (elementos.tagInputContainer) {
        tagInput = createTagInput(elementos.tagInputContainer, () => filaAtiva || []);
    }

    // Tag Input de Vendedor (single select)
    if (elementos.vendedorTagContainer) {
        vendedorInput = createTagInput(elementos.vendedorTagContainer, () => listasUsuarios.vendedores || [], { single: true });
    }

    // Listener de Criação
    if (elementos.formSeparacao) {
        elementos.formSeparacao.onsubmit = handleFormSubmit;
    }

    // Listeners de Gerenciamento da Fila
    if (elementos.gerenciarFilaModal.btnGerenciar) {
        elementos.gerenciarFilaModal.btnGerenciar.onclick = openFilaModal;
        elementos.gerenciarFilaModal.form.onsubmit = handleSaveFila;
    }

    // Listener de Busca (com Debounce)
    elementos.filtroInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            currentSearchTerm = elementos.filtroInput.value.trim();
            loadTableData(true);
        }, 500);
    });

    // Listener de Scroll Infinito (com Throttle)
    let scrollThrottle = false;
    window.addEventListener('scroll', () => {
        if (scrollThrottle || isLoading || !hasMore) return;
        scrollThrottle = true;
        setTimeout(() => { scrollThrottle = false; }, 200);

        if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 400) {
            loadTableData();
        }
    });

    // Carga Inicial
    await fetchInitialUserData();

    // Controle de Permissões de UI
    if (AppState.currentUser.permissions?.pode_criar_separacao) {
        document.getElementById('form-container-separacao').style.display = 'block';
    }

    const isGestor = AppState.currentUser.role === 'Admin' || AppState.currentUser.role === 'Separador';
    if (isGestor) {
        document.getElementById('container-fila-separadores').style.display = 'block';
        if (elementos.gerenciarFilaModal.btnGerenciar) {
            elementos.gerenciarFilaModal.btnGerenciar.style.display = 'block';
        }
    }

    // WebSocket listeners
    if (AppState.socket) {
        AppState.socket.off('nova_separacao');
        AppState.socket.off('separacao_atualizada');
        AppState.socket.off('separacao_deletada');
        AppState.socket.off('status_separacao_atualizado');
        AppState.socket.off('fila_separadores_atualizada');

        AppState.socket.on('nova_separacao', () => {
            fetchAndRenderFila();
            loadTableData(true);
        });
        AppState.socket.on('separacao_atualizada', () => loadTableData(true));
        AppState.socket.on('status_separacao_atualizado', () => loadTableData(true));
        AppState.socket.on('separacao_deletada', () => loadTableData(true));
        AppState.socket.on('fila_separadores_atualizada', () => fetchAndRenderFila());
    }

    await Promise.all([loadTableData(true), fetchAndRenderFila()]);
    setupMovSugestao();
    setupEscNavigation();
}