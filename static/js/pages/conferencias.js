// static/js/pages/conferencias.js
import { AppState } from '../state.js';
import { db } from '../firebase.js';
import { showToast } from '../toasts.js';
import { toggleButtonLoading, formatarData, showConfirmModal, openLogModal } from '../ui.js';

let state = {};

function resetState() {
    state = {
        elementos: {},
        aguardando: [],
        emConferencia: [],
        listaEstoquistas: [],
    };
}

function criarCardElement(item, tipo) {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.id = item.id;
    card.classList.add(tipo === 'aguardando' ? 'card--status-awaiting' : 'card--status-progress');

    let actions = '';
    // MUDANÇA: Adiciona um container para as informações de tempo
    let timeInfoHTML = '';

    if (tipo === 'aguardando') {
        actions = `<button class="btn btn--primary" data-action="open-conferente-modal">Adicionar Conferente</button>`;
    } else { // emConferencia
        actions = `<button class="btn btn--success" data-action="finalize">Finalizar</button>`;
        // Popula as informações de tempo apenas para a coluna "Em Conferência"
        if (item.data_inicio_conferencia) {
            timeInfoHTML = `<p><small><strong>Início:</strong> ${formatarData(item.data_inicio_conferencia)}</small></p>`;
        }
    }

    let conferentesHTML = '';
    if (item.conferentes && item.conferentes.length > 0) {
        conferentesHTML = `<p><strong>Conferente(s):</strong> ${item.conferentes.join(', ')}</p>`;
    }

    card.innerHTML = `
        <div class="card__header"><h3>NF: ${item.numero_nota_fiscal}</h3></div>
        <div class="card__body">
            <p><strong>Fornecedor:</strong> ${item.nome_fornecedor}</p>
            <p><strong>Transportadora:</strong> ${item.nome_transportadora}</p>
            <p><strong>Volumes:</strong> ${item.qtd_volumes}</p>
            <p><strong>Recebido em:</strong> ${formatarData(item.data_recebimento)}</p>
            ${conferentesHTML}
            ${timeInfoHTML}
        </div>
        <div class="card__footer">
            <div class="card__actions">${actions}</div>
        </div>
    `;

    card.querySelector('[data-action="open-conferente-modal"]')?.addEventListener('click', () => openConferenteModal(item.id));
    card.querySelector('[data-action="finalize"]')?.addEventListener('click', () => openFinalizeModal(item));

    return card;
}

function renderizarColunas() {
    const termo = state.elementos.filtroInput.value.toLowerCase().trim();
    const filterFn = item => item.numero_nota_fiscal.toLowerCase().includes(termo) || item.nome_fornecedor.toLowerCase().includes(termo);

    const render = (container, data, tipo) => {
        container.innerHTML = '';
        const filtered = data.filter(filterFn);
        if (filtered.length > 0) {
            filtered.forEach(item => container.appendChild(criarCardElement(item, tipo)));
        } else {
            container.innerHTML = `<p class="quadro-vazio-msg">Nenhum item aqui.</p>`;
        }
    };

    render(state.elementos.quadroAguardando, state.aguardando, 'aguardando');
    render(state.elementos.quadroEmConferencia, state.emConferencia, 'emConferencia');
}

function openConferenteModal(id) {
    const modal = state.elementos.addConferenteModal;
    modal.form.dataset.id = id;
    const container = modal.form.querySelector('#conferentes-checkbox-container');
    container.innerHTML = ''; // Limpa checkboxes antigos
    state.listaEstoquistas.forEach(nome => {
        container.innerHTML += `
            <label>
                <input type="checkbox" name="conferente" value="${nome}"> ${nome}
            </label>
        `;
    });
    modal.overlay.style.display = 'flex';
}

async function handleAddConferenteSubmit(event) {
    event.preventDefault();
    const modal = state.elementos.addConferenteModal;
    const id = modal.form.dataset.id;
    const selectedConferentes = Array.from(modal.form.querySelectorAll('input[name="conferente"]:checked')).map(cb => cb.value);

    if (selectedConferentes.length === 0) {
        showToast('Selecione pelo menos um conferente.', 'error');
        return;
    }

    const btn = modal.form.querySelector('button[type="submit"]');
    toggleButtonLoading(btn, true, 'Iniciando...');
    try {
        await fetch(`/api/conferencias/${id}/iniciar`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                conferentes: selectedConferentes,
                editor_nome: AppState.currentUser.nome // Quem clicou para iniciar
            })
        });
        showToast('Conferência iniciada!', 'success');
        modal.overlay.style.display = 'none';
    } catch (error) {
        showToast(`Erro: ${error.message}`, 'error');
    } finally {
        toggleButtonLoading(btn, false, 'Confirmar e Iniciar');
    }
}


function openFinalizeModal(item) {
    const modal = state.elementos.finalizeModal;
    modal.form.dataset.id = item.id;
    modal.obsInput.value = '';
    modal.overlay.style.display = 'flex';
}

async function handleFinalizeSubmit(event, comPendencia) {
    event.preventDefault();
    const modal = state.elementos.finalizeModal;
    const id = modal.form.dataset.id;
    const observacao = modal.obsInput.value;
    const btn = comPendencia ? modal.btnPendencia : modal.btnOk;

    if (comPendencia && !observacao.trim()) {
        showToast('Para finalizar com pendência, a observação é obrigatória.', 'error');
        return;
    }

    toggleButtonLoading(btn, true, 'Finalizando...');
    try {
        const item = state.emConferencia.find(i => i.id === id);
        const response = await fetch(`/api/conferencias/${id}/finalizar`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                editor_nome: AppState.currentUser.nome, // Quem está finalizando
                com_pendencia: comPendencia,
                observacao: observacao
            })
        });
        if (!response.ok) throw new Error((await response.json()).error);
        showToast(`Conferência finalizada ${comPendencia ? 'com pendência' : 'com sucesso'}!`, 'success');
        modal.overlay.style.display = 'none';
    } catch (error) {
        showToast(`Erro: ${error.message}`, 'error');
    } finally {
        toggleButtonLoading(btn, false, comPendencia ? 'Finalizar com Pendência' : 'Finalizar OK');
    }
}

async function fetchInitialData() {
    try {
        const response = await fetch('/api/usuarios/estoquista-nomes');
        if (!response.ok) throw new Error('Falha ao buscar estoquistas.');
        state.listaEstoquistas = await response.json();
    } catch (error) {
        showToast(error.message, "error");
    }
}

export function initConferenciasPage() {
    resetState();
    state.elementos = {
        filtroInput: document.getElementById('filtro-conferencias'),
        quadroAguardando: document.getElementById('quadro-aguardando'),
        quadroEmConferencia: document.getElementById('quadro-em-conferencia'),
        addConferenteModal: {
            overlay: document.getElementById('add-conferente-modal-overlay'),
            form: document.getElementById('form-add-conferente'),
            // NOVO: Referência para o botão de cancelar
            cancelButton: document.getElementById('btn-cancel-add-conferente')
        },
        finalizeModal: {
            overlay: document.getElementById('finalize-modal-overlay'),
            form: document.getElementById('form-finalize'),
            obsInput: document.getElementById('finalize-observacao'),
            btnOk: document.getElementById('btn-finalize-ok'),
            btnPendencia: document.getElementById('btn-finalize-pendencia'),
        }
    };

    state.elementos.filtroInput.addEventListener('input', renderizarColunas);

    state.elementos.addConferenteModal.form.addEventListener('submit', handleAddConferenteSubmit);
    // NOVO: Listener para o botão de cancelar
    state.elementos.addConferenteModal.cancelButton.addEventListener('click', () => {
        state.elementos.addConferenteModal.overlay.style.display = 'none';
    });

    state.elementos.finalizeModal.btnOk.addEventListener('click', (e) => handleFinalizeSubmit(e, false));
    state.elementos.finalizeModal.form.addEventListener('submit', (e) => handleFinalizeSubmit(e, true));

    fetchInitialData();

    const conferenciasRef = db.ref('conferencias').orderByChild('data_recebimento');
    conferenciasRef.on('value', snapshot => {
        const todos = snapshot.val() || {};
        const lista = Object.entries(todos).map(([id, data]) => ({ id, ...data })).reverse();
        state.aguardando = lista.filter(c => c.status === 'Aguardando Conferência');
        state.emConferencia = lista.filter(c => c.status === 'Em Conferência');
        renderizarColunas();
    });
}
