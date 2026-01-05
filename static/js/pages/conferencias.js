import { AppState } from '../state.js';
import { showToast } from '../toasts.js';
import { toggleButtonLoading, formatarData, openLogModal } from '../ui.js';

let state = {};
let intervalId = null;

function resetState() {
    state = {
        elementos: {},
        todasAtivas: [],
        listaEstoquistas: [],
    };
}

function criarCardElement(item) {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.id = item.id;
    const { role } = AppState.currentUser;
    let actions = '';
    let timeInfoHTML = '';

    let podeOperar = ['Admin', 'Estoque', 'Recepção'].includes(role);

    if (item.status === 'Aguardando Conferência') {
        card.classList.add('card--status-awaiting');
        actions = `<button class="btn btn--edit" data-action="iniciar" ${podeOperar ? '' : 'disabled'}>Iniciar Conferência</button>`;
    } else if (item.status === 'Em Conferência') {
        card.classList.add('card--status-progress');
        timeInfoHTML = `<p><small><strong>Início:</strong> ${formatarData(item.data_inicio_conferencia)}</small></p>`;
        actions = `
            <button class="btn btn--edit" data-action="editar-conferentes" ${podeOperar ? '' : 'disabled'}>Editar Conferentes</button>
            <button class="btn btn--success" data-action="finalizar" ${podeOperar ? '' : 'disabled'}>Finalizar</button>
        `;
    }

    let conferentesHTML = (item.conferentes && item.conferentes.length > 0)
        ? `<p><strong>Conferente(s):</strong> ${item.conferentes.join(', ')}</p>` : '';

    const logBtnHTML = `<button class="btn-icon" data-action="show-log" title="Ver Histórico"><img src="/static/history.svg" alt="Histórico"></button>`;

    card.innerHTML = `
        <div class="card__header">
            <h3>NF: ${item.numero_nota_fiscal}</h3>
            <div class="card__header-actions">${logBtnHTML}</div>
        </div>
        <div class="card__body">
            <p><strong>Fornecedor:</strong> ${item.nome_fornecedor}</p>
            ${conferentesHTML} ${timeInfoHTML}
        </div>
        <div class="card__footer"><div class="card__actions">${actions}</div></div>
    `;

    card.querySelectorAll('[data-action]').forEach(button => {
        if (button.disabled) return;
        const actionType = button.dataset.action;
        if (actionType === 'iniciar' || actionType === 'editar-conferentes') button.addEventListener('click', () => openConferenteModal(item));
        if (actionType === 'finalizar') button.addEventListener('click', () => openFinalizeModal(item.id));
        if (actionType === 'show-log') button.addEventListener('click', () => openLogModal(item.id, 'conferencias'));
    });

    return card;
}

function renderizarColunas() {
    const termo = state.elementos.filtroInput.value.toLowerCase().trim();
    const filterFn = item => item.numero_nota_fiscal.toLowerCase().includes(termo) || item.nome_fornecedor.toLowerCase().includes(termo);

    const render = (container, data) => {
        container.innerHTML = '';
        if (data.length > 0) {
            data.forEach(item => container.appendChild(criarCardElement(item)));
        } else {
            container.innerHTML = `<p class="quadro-vazio-msg">Nenhum item aqui.</p>`;
        }
    };

    const { quadroAguardando, quadroEmConferencia } = state.elementos;
    render(quadroAguardando, state.todasAtivas.filter(c => c.status === 'Aguardando Conferência' && filterFn(c)));
    render(quadroEmConferencia, state.todasAtivas.filter(c => c.status === 'Em Conferência' && filterFn(c)));
}

async function fetchData() {
    try {
        const response = await fetch('/api/conferencias/ativas');
        if (!response.ok) throw new Error('Falha ao buscar dados.');
        state.todasAtivas = await response.json();
        renderizarColunas();
    } catch (error) {
        showToast(error.message, "error");
        if (intervalId) clearInterval(intervalId);
    }
}

async function handleApiCall(form, url, method, body, successMessage, btnText) {
    const btn = form.querySelector('button[type="submit"]');
    toggleButtonLoading(btn, true, 'Salvando...');
    try {
        const response = await fetch(url, {
            method: method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
        });
        if (!response.ok) throw new Error((await response.json()).error);
        showToast(successMessage, 'success');
        form.closest('.modal-overlay').style.display = 'none';
        await fetchData();
    } catch (error) {
        showToast(`Erro: ${error.message}`, 'error');
    } finally {
        toggleButtonLoading(btn, false, btnText);
    }
}

export function initConferenciasPage() {
    resetState();
    state.elementos = {
        filtroInput: document.getElementById('filtro-conferencias'),
        quadroAguardando: document.getElementById('quadro-aguardando'),
        quadroEmConferencia: document.getElementById('quadro-em-conferencia'),
        addConferenteModal: { overlay: document.getElementById('add-conferente-modal-overlay'), form: document.getElementById('form-add-conferente') },
        finalizeModal: { overlay: document.getElementById('finalize-modal-overlay'), form: document.getElementById('form-finalize-conferencia') }
    };

    if (!state.elementos.quadroAguardando) return;

    state.elementos.filtroInput.addEventListener('input', renderizarColunas);

    state.elementos.addConferenteModal.form.addEventListener('submit', (e) => {
        e.preventDefault();
        const form = e.target, id = form.dataset.id;
        const conferentes = Array.from(form.querySelectorAll('input:checked')).map(cb => cb.value);
        if (conferentes.length === 0) return showToast('Selecione ao menos um conferente.', 'error');

        const body = { conferentes, total_itens: document.getElementById('conf-total-itens').value, editor_nome: AppState.currentUser.nome };
        handleApiCall(form, `/api/conferencias/${id}/iniciar`, 'PUT', body, 'Conferência iniciada!', 'Confirmar e Iniciar');
    });

    state.elementos.finalizeModal.form.addEventListener('submit', (e) => {
        e.preventDefault();
        const form = e.target, id = form.dataset.id;
        const body = {
            tem_pendencia_fornecedor: form.querySelector('#checkbox-pendencia-fornecedor').checked,
            solicita_alteracao: form.querySelector('#checkbox-solicitar-alteracao').checked,
            observacao: form.querySelector('#finalize-observacao').value, editor_nome: AppState.currentUser.nome
        };
        handleApiCall(form, `/api/conferencias/${id}/finalizar-conferencia`, 'PUT', body, 'Finalizado com sucesso!', 'Confirmar Finalização');
    });

    (async () => {
        try {
            const response = await fetch('/api/usuarios/estoquista-nomes');
            state.listaEstoquistas = await response.json();
        } catch (e) { console.error('Erro ao carregar estoquistas'); }
    })();

    fetchData();

    if (AppState.socket) {
        AppState.socket.off('novo_recebimento');
        AppState.socket.off('conferencia_iniciada');
        AppState.socket.off('conferencia_finalizada');
        AppState.socket.off('conferencia_editada');
        AppState.socket.off('conferencia_deletada');

        const refresh = () => fetchData();

        AppState.socket.on('novo_recebimento', refresh);
        AppState.socket.on('conferencia_iniciada', refresh);
        AppState.socket.on('conferencia_finalizada', refresh);
        AppState.socket.on('conferencia_editada', refresh);
        AppState.socket.on('conferencia_deletada', refresh);
    }

    fetchData(); // Carga inicial
}

function openConferenteModal(item) {
    const modal = state.elementos.addConferenteModal;
    modal.form.dataset.id = item.id;
    const container = modal.form.querySelector('#conferentes-checkbox-container');
    container.innerHTML = state.listaEstoquistas.map(nome => `<label><input type="checkbox" value="${nome}" ${item.conferentes?.includes(nome) ? 'checked' : ''}> ${nome}</label>`).join('');
    modal.overlay.style.display = 'flex';
}

function openFinalizeModal(id) {
    const modal = state.elementos.finalizeModal;
    modal.form.dataset.id = id;
    modal.form.reset();
    modal.overlay.style.display = 'flex';
}