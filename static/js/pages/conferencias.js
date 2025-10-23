import { AppState } from '../state.js';
import { showToast } from '../toasts.js';
import { toggleButtonLoading, formatarData, showConfirmModal, openLogModal } from '../ui.js';

let state = {};
let intervalId = null;

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
    let timeInfoHTML = '';

    if (tipo === 'aguardando') {
        actions = `<button class="btn btn--primary" data-action="open-conferente-modal">Adicionar Conferente</button>`;
    } else { // emConferencia
        actions = `<button class="btn btn--success" data-action="finalize">Finalizar</button>`;
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

async function fetchData() {
    /**
     * Busca os dados da API local e atualiza o estado e a tela.
     */
    try {
        // Criaremos esta nova rota no backend
        const response = await fetch('/api/conferencias/ativas');
        if (!response.ok) {
            throw new Error('Falha ao buscar dados de conferências.');
        }
        const todasAtivas = await response.json();

        // Separa os dados nas colunas corretas
        state.aguardando = todasAtivas.filter(c => c.status === 'Aguardando Conferência');
        state.emConferencia = todasAtivas.filter(c => c.status === 'Em Conferência');

        renderizarColunas();

    } catch (error) {
        console.error("Erro ao buscar conferências ativas:", error);
        showToast(error.message, "error");
        if (intervalId) clearInterval(intervalId); // Para de tentar se der erro
    }
}

function openConferenteModal(id) {
    const modal = state.elementos.addConferenteModal;
    modal.form.dataset.id = id;
    const container = modal.form.querySelector('#conferentes-checkbox-container');
    container.innerHTML = '';
    state.listaEstoquistas.forEach(nome => {
        container.innerHTML += `<label><input type="checkbox" name="conferente" value="${nome}"> ${nome}</label>`;
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

    const btn = modal.btnConfirmar; // Usa a referência correta
    toggleButtonLoading(btn, true, 'Iniciando...');
    try {
        await fetch(`/api/conferencias/${id}/iniciar`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                conferentes: selectedConferentes,
                editor_nome: AppState.currentUser.nome
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
    // IDs ATUALIZADOS
    modal.obsInput.value = '';
    modal.checkPendencia.checked = false;
    modal.checkAlteracao.checked = false;
    modal.overlay.style.display = 'flex';
}

async function handleFinalizeSubmit(event) {
    event.preventDefault();
    const modal = state.elementos.finalizeModal;
    const id = modal.form.dataset.id;
    // IDs ATUALIZADOS
    const observacao = modal.obsInput.value;
    const temPendencia = modal.checkPendencia.checked;
    const solicitaAlteracao = modal.checkAlteracao.checked;
    const btn = modal.btnConfirmar;


    if ((temPendencia || solicitaAlteracao) && !observacao.trim()) {
        showToast('A observação é obrigatória quando há qualquer tipo de divergência.', 'error');
        return;
    }

    toggleButtonLoading(btn, true, 'Confirmando...');
    try {
        const response = await fetch(`/api/conferencias/${id}/finalizar-conferencia`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                editor_nome: AppState.currentUser.nome,
                observacao: observacao,
                tem_pendencia_fornecedor: temPendencia,
                solicita_alteracao: solicitaAlteracao
            })
        });
        if (!response.ok) throw new Error((await response.json()).error);
        showToast('Finalização registrada com sucesso!', 'success');
        modal.overlay.style.display = 'none';
    } catch (error) {
        showToast(`Erro: ${error.message}`, 'error');
    } finally {
        toggleButtonLoading(btn, false, 'Confirmar Finalização');
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
            cancelButton: document.getElementById('btn-cancel-add-conferente'),
            btnConfirmar: document.getElementById('btn-confirmar-add-conferente') // Referência com ID corrigido
        },
        finalizeModal: {
            overlay: document.getElementById('finalize-modal-overlay'),
            // IDs ATUALIZADOS PARA SEREM ÚNICOS DA PÁGINA DE CONFERÊNCIAS
            form: document.getElementById('form-finalize-conferencia'),
            obsInput: document.getElementById('finalize-observacao-conferencia'),
            checkPendencia: document.getElementById('checkbox-pendencia-fornecedor-conferencia'),
            checkAlteracao: document.getElementById('checkbox-solicitar-alteracao-conferencia'),
            btnConfirmar: document.getElementById('btn-confirmar-finalizacao-conferencia')
        }
    };

    // Verifica se os elementos principais existem antes de adicionar listeners
    if (!state.elementos.filtroInput || !state.elementos.addConferenteModal.form || !state.elementos.finalizeModal.form) {
        console.error("Elementos essenciais da página de conferências não foram encontrados. A inicialização foi interrompida.");
        return;
    }

    state.elementos.filtroInput.addEventListener('input', renderizarColunas);
    state.elementos.addConferenteModal.form.addEventListener('submit', handleAddConferenteSubmit);
    state.elementos.finalizeModal.form.addEventListener('submit', handleFinalizeSubmit);

    fetchInitialData();

    // --- CORREÇÃO FINAL ---
    // Remove a lógica antiga do Firebase
    /*
    const conferenciasRef = db.ref('conferencias').orderByChild('data_recebimento');
    conferenciasRef.on('value', snapshot => {
        // ... código antigo ...
    });
    */

    // Inicia a busca de dados da API local
    fetchData();
    // Inicia o polling para atualizações periódicas
    if (intervalId) clearInterval(intervalId);
    intervalId = setInterval(fetchData, 20000); // Atualiza a cada 20 segundos
    // --- FIM DA CORREÇÃO FINAL ---
}