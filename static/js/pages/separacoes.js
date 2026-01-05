// static/js/pages/separacoes.js
import { AppState } from '../state.js';
import { showToast } from '../toasts.js';
import { toggleButtonLoading, formatarData, showConfirmModal, openLogModal } from '../ui.js';

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
            await Promise.all([
                fetchAndRenderFila(),
                fetchActiveSeparacoes(),
            ]);
        }
    } catch (error) {
        console.error("Erro no polling de separações:", error);
    }
}

function resetState() {
    state = {
        elementos: {},
        listasUsuarios: { expedicao: [], vendedores: [], separadores: [] },
        filaAtiva: [],
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

// --- FUNÇÕES DE FILA (GERENCIAMENTO) ---
async function openFilaModal() {
    const modal = state.elementos.gerenciarFilaModal;
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
    const modal = state.elementos.gerenciarFilaModal;
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

// --- SELEÇÃO DE SEPARADORES (CRIAÇÃO) ---
function openSelecionarSeparadorModal() {
    const modal = state.elementos.selecionarSeparadorModal;
    modal.checkboxContainer.innerHTML = '';
    const disponiveis = state.filaAtiva || [];

    if (disponiveis.length === 0) {
        modal.checkboxContainer.innerHTML = '<p>Nenhum separador ativo na fila no momento.</p>';
    } else {
        disponiveis.forEach(nome => {
            const isChecked = state.selecionadosNoForm.includes(nome);
            const label = document.createElement('label');
            label.innerHTML = `<input type="checkbox" value="${nome}" ${isChecked ? 'checked' : ''}> ${nome}`;
            modal.checkboxContainer.appendChild(label);
        });
    }
    modal.overlay.style.display = 'flex';
}

function confirmarSelecaoSeparadores() {
    const checkboxes = state.elementos.selecionarSeparadorModal.checkboxContainer.querySelectorAll('input:checked');
    state.selecionadosNoForm = Array.from(checkboxes).map(cb => cb.value);
    state.elementos.separadoresDisplay.textContent = state.selecionadosNoForm.length > 0 ? state.selecionadosNoForm.join(', ') : 'Nenhum selecionado';
    state.elementos.selecionarSeparadorModal.overlay.style.display = 'none';
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
    const separadoresDisplay = (separacao.separadores_nomes || []).join(', ') || 'N/A';

    let footerActions = [];
    if (separacao.status !== 'Finalizado') {
        footerActions.push(`<button class="btn btn--edit" data-action="edit">Editar</button>`);
        footerActions.push(`<button class="btn btn--secondary" data-action="observation">Observação</button>`);
        if (separacao.status === 'Em Conferência' && perms.pode_finalizar_separacao) {
            footerActions.push(`<button class="btn btn--success" data-action="finalize">Finalizar</button>`);
        }
    }

    let conferenteSelectHTML = '';
    if (separacao.status === 'Em Separação' && perms.pode_enviar_para_conferencia) {
        let options = '<option value="" disabled selected>-- Enviar para Conferente --</option>';
        state.listasUsuarios.expedicao.forEach(nome => options += `<option value="${nome}">${nome}</option>`);
        conferenteSelectHTML = `<div class="comprador-select-wrapper"><select data-action="assign-conferente">${options}</select></div>`;
    }

    card.innerHTML = `
        <div class="card__header">
            <h3>Mov. ${separacao.numero_movimentacao}</h3>
            <div class="card__header-actions">
                <button class="btn-icon" data-action="log" title="Histórico"><img src="/static/history.svg"></button>
                ${perms.pode_deletar_separacao ? '<button class="btn btn--danger" data-action="delete">Excluir</button>' : ''}
            </div>
        </div>
        <div class="card__body">
            <div class="card-info-grid">
                <p><strong>Cliente:</strong> ${separacao.nome_cliente}</p>
                <p><strong>Vendedor:</strong> ${separacao.vendedor_nome}</p>
                <p><strong>Separadores:</strong> ${separadoresDisplay}</p>
                <p><strong>Peças:</strong> ${separacao.qtd_pecas || 0}</p>
            </div>
        </div>
        <div class="card__footer">
            <div class="card__actions">${footerActions.join('')}</div>
            ${conferenteSelectHTML}
        </div>`;

    card.querySelector('[data-action="log"]').onclick = () => openLogModal(separacao.id, 'separacoes');
    card.querySelector('[data-action="delete"]')?.addEventListener('click', () => handleDelete(separacao.id));
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

async function fetchAndRenderFila() {
    try {
        const res = await fetch('/api/separacoes/fila-separadores');
        const fila = await res.json();
        state.filaAtiva = fila;
        const lista = document.getElementById('fila-separadores-lista');
        if (lista) {
            lista.innerHTML = fila.length ? fila.map((n, i) => `<li class="${i === 0 ? 'proximo-separador' : ''}">${n}</li>`).join('') : '<li>Nenhum separador na fila</li>';
        }
    } catch (e) { console.error(e); }
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
        separadoresDisplay: document.getElementById('separadores-selecionados-display'),
        selecionarSeparadorModal: {
            overlay: document.getElementById('selecionar-separador-modal-overlay'),
            checkboxContainer: document.getElementById('separadores-checkbox-container'),
            btnConfirmar: document.getElementById('btn-confirmar-selecao-separadores')
        },
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
        },
        gerenciarFilaModal: {
            overlay: document.getElementById('gerenciar-fila-modal-overlay'),
            form: document.getElementById('form-gerenciar-fila'),
            checkboxContainer: document.getElementById('fila-checkbox-container'),
            saveButton: document.getElementById('btn-save-fila'),
            btnGerenciar: document.getElementById('btn-gerenciar-fila')
        }
    };

    if (!state.elementos.filtroInput) return;

    // Listeners de Busca e Filtro
    state.elementos.btnReload.onclick = () => { state.elementos.filtroInput.value = ''; renderAtivas(); carregarFinalizados(true); };
    state.elementos.filtroInput.oninput = () => { renderAtivas(); clearTimeout(debounceTimer); debounceTimer = setTimeout(() => carregarFinalizados(true), 500); };

    // Listeners de Seleção de Separadores (Criação)
    state.elementos.separadoresDisplay.onclick = openSelecionarSeparadorModal;
    state.elementos.selecionarSeparadorModal.btnConfirmar.onclick = confirmarSelecaoSeparadores;

    // Listeners de Paginação
    state.elementos.btnCarregarMais.onclick = () => carregarFinalizados();

    // Listener de Criação
    state.elementos.formSeparacao.onsubmit = async (e) => {
        e.preventDefault();
        const mov = document.getElementById('numero-movimentacao').value;
        if (mov.length !== 6) return showToast('Nº Movimentação deve ter 6 dígitos', 'error');
        if (state.selecionadosNoForm.length === 0) return showToast('Selecione ao menos um separador', 'error');

        const body = {
            numero_movimentacao: mov,
            qtd_pecas: document.getElementById('qtd-pecas').value,
            nome_cliente: document.getElementById('nome-cliente').value,
            vendedor_nome: document.getElementById('vendedor-nome').value,
            separadores_nomes: state.selecionadosNoForm,
            editor_nome: AppState.currentUser.nome
        };
        const res = await fetch('/api/separacoes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (res.ok) {
            showToast('Criado!');
            state.elementos.formSeparacao.reset();
            state.selecionadosNoForm = [];
            confirmarSelecaoSeparadores();
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

    // Listeners de Gerenciamento da Fila
    if (state.elementos.gerenciarFilaModal.btnGerenciar) {
        state.elementos.gerenciarFilaModal.btnGerenciar.onclick = openFilaModal;
        state.elementos.gerenciarFilaModal.form.onsubmit = handleSaveFila;
    }

    // Carregamento de Dados Iniciais
    const [vRes, sRes, eRes] = await Promise.all([
        fetch('/api/usuarios/vendedor-nomes'),
        fetch('/api/usuarios/separador-nomes'),
        fetch('/api/usuarios/expedicao-nomes')
    ]);
    state.listasUsuarios = {
        vendedores: await vRes.json(),
        separadores: (await sRes.json()).filter(n => n.toLowerCase() !== 'separacao'),
        expedicao: await eRes.json()
    };

    populateSelect(document.getElementById('vendedor-nome'), state.listasUsuarios.vendedores);

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
            fetchAndRenderFila();
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

    const isGestor = AppState.currentUser.role === 'Admin' || AppState.currentUser.role === 'Separador';
    if (isGestor) {
        document.getElementById('container-fila-separadores').style.display = 'block';
        if (state.elementos.gerenciarFilaModal.btnGerenciar) {
            state.elementos.gerenciarFilaModal.btnGerenciar.style.display = 'block';
        }
    }

    await Promise.all([fetchActiveSeparacoes(), fetchAndRenderFila(), carregarFinalizados(true)]);

    // Início do Polling
    if (pollingInterval) clearInterval(pollingInterval);
    pollingInterval = setInterval(verificarAtualizacoesSeparacoes, 5000);
}