// static/js/pages/separacoes.js
import { AppState } from '../state.js';
import { showToast } from '../toasts.js';
import { formatarData, showConfirmModal, openLogModal } from '../ui.js';

let state = {};
let debounceTimer;
let pollingInterval = null;

let estadoAnterior = {
    total_ativas: 0,
    ultimo_update: null,
};

// --- FUNÇÃO DE POLLING ---
async function verificarAtualizacoesSeparacoes() {
    if (document.activeElement === state.elementos.filtroInput && state.elementos.filtroInput.value !== '') {
        return;
    }
    try {
        const response = await fetch('/api/separacoes/status-ativas');
        if (!response.ok) return;
        const estadoAtual = await response.json();

        if (estadoAtual.total_ativas !== estadoAnterior.total_ativas || estadoAtual.ultimo_update !== estadoAnterior.ultimo_update) {
            console.log("Detectada mudança nas separações. Atualizando...");
            estadoAnterior = estadoAtual;
            await fetchActiveSeparacoes();
        }
    } catch (error) {
        console.error("Erro no polling de separações:", error);
    }
}

function resetState() {
    state = {
        elementos: {},
        listasUsuarios: { expedicao: [], vendedores: [], separadores: [] },
        selecionadosNoForm: [],
        todasAsSeparacoesAtivas: [],
        dadosAtivos: { andamento: [], conferencia: [] },
        dadosFinalizados: [],
        paginaAtual: 0,
        carregando: false,
        temMais: true,
        termoBusca: ''
    };
}

// --- FUNÇÕES DE MODAL (OBSERVAÇÃO COM HISTÓRICO) ---
function openObservacaoModal(separacao) {
    const modal = state.elementos.obsModal;
    modal.form.dataset.id = separacao.id;
    modal.textoInput.value = '';

    const historicoContainer = document.getElementById('separacao-historico-observacoes');
    historicoContainer.innerHTML = '<h4>Histórico de Observações:</h4>';

    if (separacao.observacoes && Object.keys(separacao.observacoes).length > 0) {
        const obsArray = Object.values(separacao.observacoes).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        obsArray.forEach(obs => {
            const entry = document.createElement('div');
            entry.className = 'obs-entry';
            let roleStyle = obs.role === 'Expedição' ? 'color: var(--clr-warning);' : 'color: var(--clr-primary);';

            entry.innerHTML = `
                <span style="${roleStyle}"><strong>${obs.autor}:</strong></span> ${obs.texto}
                <small>${formatarData(obs.timestamp)}</small>
            `;
            historicoContainer.appendChild(entry);
        });
    } else {
        historicoContainer.innerHTML += '<p>Nenhuma observação registrada.</p>';
    }

    modal.overlay.style.display = 'flex';
    setTimeout(() => modal.textoInput.focus(), 100);
}

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

// --- SUGESTÃO Nº MOVIMENTAÇÃO (ghost text + Tab) ---
let sugestaoMov = null;

function calcularProximaMov() {
    let maxMov = 0;
    const todas = [...(state.todasAsSeparacoesAtivas || []), ...(state.dadosFinalizados || [])];
    todas.forEach(sep => {
        const num = parseInt(sep.numero_movimentacao);
        if (num > maxMov) maxMov = num;
    });
    return maxMov > 0 ? String(maxMov + 1) : null;
}

function setupMovSugestao() {
    const input = document.getElementById('numero-movimentacao');
    if (!input || input.closest('.mov-suggestion-wrapper')) return;

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
        // Só aceita a sugestão se o campo ainda não tem os 6 dígitos completos
        if (e.key === 'Tab' && sugestaoMov && input.value.length < 6 && input.value !== sugestaoMov) {
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
    const input = document.getElementById('numero-movimentacao');
    if (input) input.dispatchEvent(new Event('focus'));
}

// --- EDIÇÃO DE SEPARAÇÃO ---
function openEditModal(separacao) {
    const modal = state.elementos.editModal;
    modal.form.dataset.id = separacao.id;
    modal.movimentacaoInput.value = separacao.numero_movimentacao;
    modal.clienteInput.value = separacao.nome_cliente;
    modal.qtdPecasInput.value = separacao.qtd_pecas || '';

    populateSelect(modal.vendedorSelect, state.listasUsuarios.vendedores, separacao.vendedor_nome);

    modal.separadorContainer.innerHTML = '';
    state.listasUsuarios.separadores.forEach(nome => {
        const isChecked = separacao.separadores_nomes?.includes(nome);
        const label = document.createElement('label');
        label.innerHTML = `<input type="checkbox" value="${nome}" ${isChecked ? 'checked' : ''}> ${nome}`;
        modal.separadorContainer.appendChild(label);
    });

    populateSelect(modal.conferenteSelect, state.listasUsuarios.expedicao, separacao.conferente_nome);
    modal.conferenteSelect.insertAdjacentHTML('afterbegin', '<option value="">-- Remover Conferente --</option>');
    if (!separacao.conferente_nome) modal.conferenteSelect.value = "";

    modal.overlay.style.display = 'flex';
}

// --- RENDERIZAÇÃO DE CARDS ---
function criarCardElement(separacao) {
    const card = document.createElement('div');
    card.className = 'card separacao-card';
    card.dataset.id = separacao.id;

    if (separacao.status === 'Finalizado') card.classList.add('card--status-done');
    else if (separacao.status === 'Em Conferência') card.classList.add('card--status-progress');
    else card.classList.add('card--status-awaiting');

    const perms = AppState.currentUser.permissions || {};
    const role = AppState.currentUser.role;
    const isVendedor = role === 'Vendedor';

    const separadoresDisplay = (separacao.separadores_nomes || []).join(', ') || 'N/A';

    // Botões de ação no header
    let headerActions = [];
    headerActions.push(`<button class="btn-icon btn-log" data-action="log" data-tooltip="Histórico"><img src="/static/history.svg" style="width:14px; opacity:0.5;"></button>`);

    if (!isVendedor) {
        headerActions.push(`<button class="btn-icon" data-action="edit" data-tooltip="Editar" title="Editar">✏️</button>`);
        headerActions.push(`<button class="btn-icon" data-action="observation" data-tooltip="Observação" title="Observação">💬</button>`);
        if (separacao.status === 'Em Conferência' && perms.pode_finalizar_separacao) {
            headerActions.push(`<button class="btn-icon btn-icon--success" data-action="finalize" data-tooltip="Finalizar" title="Finalizar">✔</button>`);
        }
    }

    if (perms.pode_deletar_separacao && !isVendedor) {
        headerActions.push(`<button class="btn-delete-card" data-tooltip="Excluir" data-action="delete" title="Excluir">×</button>`);
    }

    let conferenteSelectHTML = '';
    if (!isVendedor && separacao.status === 'Em Separação' && perms.pode_enviar_para_conferencia) {
        let options = '<option value="" disabled selected>-- Conferente --</option>';
        state.listasUsuarios.expedicao.forEach(nome => options += `<option value="${nome}">${nome}</option>`);
        conferenteSelectHTML = `<div class="separacao-conferente-select"><select data-action="assign-conferente">${options}</select></div>`;
    }

    // Barra de preview da última observação
    let obsPreviewHTML = '';
    if (separacao.observacoes && Object.keys(separacao.observacoes).length > 0) {
        const obsArray = Object.values(separacao.observacoes).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        const ultima = obsArray[0];
        obsPreviewHTML = `<div class="obs-preview" data-action="open-obs" title="${ultima.autor}: ${ultima.texto}">⚠ "${ultima.texto}" — ${ultima.autor}</div>`;
    }

    const fimHTML = separacao.data_finalizacao
        ? `<p><strong>Fim:</strong> ${formatarData(separacao.data_finalizacao)}</p>`
        : '';

    card.innerHTML = `
        <div class="card__header">
            <h3>Mov. ${separacao.numero_movimentacao}</h3>
            <div class="card__header-actions">
                ${headerActions.join('')}
            </div>
        </div>
        ${conferenteSelectHTML}
        <div class="card__body">
            <div class="card-info-grid">
                <p><strong>Cliente:</strong> ${separacao.nome_cliente}</p>
                <p><strong>Vendedor:</strong> ${separacao.vendedor_nome}</p>
                <p><strong>Separadores:</strong> ${separadoresDisplay}</p>
                <p><strong>Conferente:</strong> ${separacao.conferente_nome || 'N/A'}</p>
                <p><strong>Peças:</strong> ${separacao.qtd_pecas || '0'}</p>
                <p><strong>Início:</strong> ${formatarData(separacao.data_criacao)}</p>
                ${fimHTML}
            </div>
        </div>
        ${obsPreviewHTML}`;
    // -----------------------------------------------------------

    card.querySelector('[data-action="log"]').onclick = () => openLogModal(separacao.id, 'separacoes');
    card.querySelector('[data-action="delete"]')?.addEventListener('click', () => handleDelete(separacao.id));
    card.querySelector('[data-action="open-obs"]')?.addEventListener('click', () => openObservacaoModal(separacao));
    card.querySelector('[data-action="edit"]')?.addEventListener('click', () => openEditModal(separacao));
    card.querySelector('[data-action="observation"]')?.addEventListener('click', () => openObservacaoModal(separacao));
    card.querySelector('[data-action="finalize"]')?.addEventListener('click', () => handleFinalize(separacao.id));
    card.querySelector('[data-action="assign-conferente"]')?.addEventListener('change', (e) => handleAssignConferente(e, separacao.id));

    return card;
}

// --- BUSCA DE DADOS ---
async function fetchActiveSeparacoes() {
    try {
        const { role, nome } = AppState.currentUser;
        const res = await fetch(`/api/separacoes/ativas?user_role=${role}&user_name=${nome}`);
        state.todasAsSeparacoesAtivas = await res.json();
        renderAtivas();
    } catch (e) { console.error(e); }
}

function renderAtivas() {
    const termo = state.elementos.filtroInput.value.toLowerCase().trim();
    const filter = s => s.numero_movimentacao.includes(termo) || s.nome_cliente.toLowerCase().includes(termo) || s.vendedor_nome.toLowerCase().includes(termo);

    const andamento = state.todasAsSeparacoesAtivas.filter(s => s.status === 'Em Separação' && filter(s));
    const conferencia = state.todasAsSeparacoesAtivas.filter(s => s.status === 'Em Conferência' && filter(s));

    state.elementos.quadroAndamento.innerHTML = '';
    state.elementos.quadroConferencia.innerHTML = '';

    if (andamento.length === 0) state.elementos.quadroAndamento.innerHTML = '<p class="quadro-vazio-msg">Nenhuma separação ativa.</p>';
    if (conferencia.length === 0) state.elementos.quadroConferencia.innerHTML = '<p class="quadro-vazio-msg">Nenhuma conferência ativa.</p>';

    andamento.forEach(s => state.elementos.quadroAndamento.appendChild(criarCardElement(s)));
    conferencia.forEach(s => state.elementos.quadroConferencia.appendChild(criarCardElement(s)));
}

async function carregarFinalizados(recarregar = false) {
    if (state.carregando || (!state.temMais && !recarregar)) return;
    state.carregando = true;
    if (recarregar) {
        state.paginaAtual = 0;
        state.temMais = true;
        state.elementos.quadroFinalizadas.innerHTML = '';
    }

    state.elementos.spinner.style.display = 'block';
    try {
        const res = await fetch('/api/separacoes/paginadas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ page: state.paginaAtual, search: state.termoBusca, user_role: AppState.currentUser.role, user_name: AppState.currentUser.nome })
        });
        const data = await res.json();
        data.finalizadas.forEach(s => state.elementos.quadroFinalizadas.appendChild(criarCardElement(s)));
        state.temMais = data.temMais;
        state.paginaAtual++;
    } catch (e) { console.error(e); }

    state.carregando = false;
    state.elementos.spinner.style.display = 'none';
    state.elementos.btnCarregarMais.style.display = state.temMais ? 'block' : 'none';
}

const handleDelete = (id) => showConfirmModal('Excluir esta separação?', async () => {
    try {
        const res = await fetch(`/api/separacoes/${id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ editor_nome: AppState.currentUser.nome }) });
        if (res.ok) { showToast('Excluído com sucesso'); fetchActiveSeparacoes(); }
    } catch (e) { showToast('Erro ao excluir', 'error'); }
});

const handleFinalize = (id) => showConfirmModal('Finalizar esta separação?', async () => {
    try {
        const res = await fetch(`/api/separacoes/${id}/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'Finalizado', editor_nome: AppState.currentUser.nome }) });
        if (res.ok) { showToast('Finalizada!'); fetchActiveSeparacoes(); carregarFinalizados(true); }
    } catch (e) { showToast('Erro ao finalizar', 'error'); }
});

const handleAssignConferente = (e, id) => {
    const nome = e.target.value;
    showConfirmModal(`Atribuir a conferência para ${nome}?`, async () => {
        try {
            const res = await fetch(`/api/separacoes/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conferente_nome: nome, editor_nome: AppState.currentUser.nome }) });
            if (res.ok) { showToast('Enviado para conferência'); fetchActiveSeparacoes(); }
        } catch (e) { showToast('Erro ao atribuir', 'error'); }
    }, () => { e.target.value = ''; });
};

function populateSelect(el, list, val) {
    if (!el) return;
    el.innerHTML = '<option value="" disabled selected>Selecione</option>' + list.map(n => `<option value="${n}" ${n === val ? 'selected' : ''}>${n}</option>`).join('');
}

// --- INICIALIZAÇÃO DA PÁGINA ---
export async function initSeparacoesPage() {
    resetState();
    state.elementos = {
        formSeparacao: document.getElementById('form-separacao'),
        quadroAndamento: document.getElementById('quadro-separacoes-andamento'),
        quadroConferencia: document.getElementById('quadro-separacoes-conferencia'),
        quadroFinalizadas: document.getElementById('quadro-separacoes-finalizadas'),
        filtroInput: document.getElementById('filtro-separacoes'),
        btnReload: document.getElementById('btn-reload-separacoes'),
        btnCarregarMais: document.getElementById('btn-carregar-mais'),
        spinner: document.getElementById('loading-spinner'),
        tagInputContainer: document.getElementById('separadores-tag-input'),
        vendedorTagContainer: document.getElementById('vendedor-tag-input'),
        obsModal: {
            overlay: document.getElementById('obs-separacao-modal-overlay'),
            form: document.getElementById('form-obs-separacao'),
            textoInput: document.getElementById('obs-texto')
        },
        editModal: {
            overlay: document.getElementById('edit-separacao-modal-overlay'),
            form: document.getElementById('form-edit-separacao'),
            movimentacaoInput: document.getElementById('edit-numero-movimentacao'),
            qtdPecasInput: document.getElementById('edit-qtd-pecas'),
            clienteInput: document.getElementById('edit-nome-cliente'),
            vendedorSelect: document.getElementById('edit-vendedor-nome'),
            conferenteSelect: document.getElementById('edit-conferente-nome'),
            separadorContainer: document.getElementById('edit-separador-container')
        }
    };

    if (!state.elementos.filtroInput) return;

    // Listeners de Busca e Filtro
    state.elementos.btnReload.onclick = () => {
        state.elementos.filtroInput.value = '';
        state.termoBusca = ''; // <--- Importante: Limpa a variável de estado
        renderAtivas();
        carregarFinalizados(true);
    };

    state.elementos.filtroInput.oninput = (e) => {
        // 1. Atualiza a variável de estado usada na busca do servidor (Finalizadas)
        state.termoBusca = e.target.value;

        // 2. Filtra visualmente as colunas ativas (Client-side)
        renderAtivas();

        // 3. Aguarda o usuário parar de digitar para buscar no servidor (Server-side)
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            carregarFinalizados(true); // true = recarregar a lista do zero com o novo filtro
        }, 500);
    };


    // Tag Input de Separadores (Criação)
    if (state.elementos.tagInputContainer) {
        state.tagInput = createTagInput(state.elementos.tagInputContainer, () => {
            return state.filaAtiva || state.listasUsuarios.separadores || [];
        });
    }

    // Tag Input de Vendedor (single select)
    if (state.elementos.vendedorTagContainer) {
        state.vendedorInput = createTagInput(state.elementos.vendedorTagContainer, () => {
            return state.listasUsuarios.vendedores || [];
        }, { single: true });
    }

    // Listeners de Paginação
    state.elementos.btnCarregarMais.onclick = () => carregarFinalizados();

    // Listener de Criação
    state.elementos.formSeparacao.onsubmit = async (e) => {
        e.preventDefault();
        const mov = document.getElementById('numero-movimentacao').value;
        if (mov.length !== 6) return showToast('Nº Movimentação deve ter 6 dígitos', 'error');
        const separadoresSelecionados = state.tagInput ? state.tagInput.selected : state.selecionadosNoForm;
        if (separadoresSelecionados.length === 0) return showToast('Selecione ao menos um separador', 'error');
        const vendedorNome = state.vendedorInput ? state.vendedorInput.value : document.getElementById('vendedor-nome')?.value;
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
            showToast('Criado!');
            state.elementos.formSeparacao.reset();
            state.selecionadosNoForm = [];
            if (state.tagInput) state.tagInput.clear();
            if (state.vendedorInput) state.vendedorInput.clear();
            autoPreencherMovimentacao();
            fetchActiveSeparacoes();
        }
        else { const err = await res.json(); showToast(err.error, 'error'); }
    };

    // Listener de Observação
    state.elementos.obsModal.form.onsubmit = async (e) => {
        e.preventDefault();
        const id = e.target.dataset.id;
        const res = await fetch(`/api/separacoes/${id}/observacao`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto: state.elementos.obsModal.textoInput.value, autor: AppState.currentUser.nome, role: AppState.currentUser.role }) });
        if (res.ok) { showToast('Observação salva!'); state.elementos.obsModal.overlay.style.display = 'none'; fetchActiveSeparacoes(); }
    };

    // Listener de Edição
    state.elementos.editModal.form.onsubmit = async (e) => {
        e.preventDefault();
        const seps = Array.from(state.elementos.editModal.separadorContainer.querySelectorAll('input:checked')).map(c => c.value);
        const body = {
            numero_movimentacao: state.elementos.editModal.movimentacaoInput.value,
            qtd_pecas: state.elementos.editModal.qtdPecasInput.value,
            nome_cliente: state.elementos.editModal.clienteInput.value,
            vendedor_nome: state.elementos.editModal.vendedorSelect.value,
            conferente_nome: state.elementos.editModal.conferenteSelect.value,
            separadores_nomes: seps,
            editor_nome: AppState.currentUser.nome
        };
        const res = await fetch(`/api/separacoes/${e.target.dataset.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (res.ok) {
            showToast('Salvo!');
            state.elementos.editModal.overlay.style.display = 'none';
            fetchActiveSeparacoes();
            carregarFinalizados(true);
        } else {
            // MOSTRA O ERRO DE DUPLICIDADE SE O BACKEND RETORNAR 409
            const err = await res.json();
            showToast(err.error, 'error');
        }
    };

    // Carregamento de Dados Iniciais
    const [vRes, sRes, eRes, filaRes] = await Promise.all([
        fetch('/api/usuarios/vendedor-nomes'),
        fetch('/api/usuarios/separador-nomes'),
        fetch('/api/usuarios/expedicao-nomes'),
        fetch('/api/separacoes/fila-separadores')
    ]);
    state.listasUsuarios = {
        vendedores: await vRes.json(),
        separadores: (await sRes.json()).filter(n => n.toLowerCase() !== 'separacao'),
        expedicao: await eRes.json()
    };
    state.filaAtiva = await filaRes.json();

    // Controle de Permissões de UI
    if (AppState.currentUser.permissions?.pode_criar_separacao) document.getElementById('form-container-separacao').style.display = 'block';

    if (AppState.socket) {
        // Remove listeners antigos para não duplicar
        AppState.socket.off('nova_separacao');
        AppState.socket.off('separacao_atualizada');
        AppState.socket.off('separacao_deletada');
        AppState.socket.off('status_separacao_atualizado');

        // Quando alguém cria uma separação
        AppState.socket.on('nova_separacao', () => {
            fetchActiveSeparacoes();
        });

        // Quando alguém edita (troca separador, conferente, cliente)
        AppState.socket.on('separacao_atualizada', () => {
            fetchActiveSeparacoes();
        });

        // Quando muda o status (Em Separação -> Conferência -> Finalizado)
        AppState.socket.on('status_separacao_atualizado', () => {
            fetchActiveSeparacoes();
            carregarFinalizados(true); // Recarrega a coluna de finalizados
        });

        AppState.socket.on('separacao_deletada', () => {
            fetchActiveSeparacoes();
        });
    }

    await Promise.all([fetchActiveSeparacoes(), carregarFinalizados(true)]);
    setupMovSugestao();
    setupEscNavigation();

    // Início do Polling
    if (pollingInterval) clearInterval(pollingInterval);
    pollingInterval = setInterval(verificarAtualizacoesSeparacoes, 5000);
}