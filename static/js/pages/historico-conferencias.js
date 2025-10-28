// static/js/pages/historico-conferencias.js
import { AppState } from '../state.js';
import { showToast } from '../toasts.js';
// --- CORREÇÃO AQUI ---
import { formatarData, toggleButtonLoading } from '../ui.js';

// --- Estado e Constantes (sem alterações) ---
const TAMANHO_PAGINA = 20;
let paginaAtual = 0;
let carregando = false;
let temMais = true;
let filtrosAtuais = {};
let elementos = {};

// --- Lógica do Modal de Detalhes (sem alterações) ---
function openDetailsModal(item) {
    const modalOverlay = document.getElementById('details-modal-overlay');
    const modalTitle = document.getElementById('details-modal-title');
    const modalBody = document.getElementById('details-modal-body');

    if (!modalOverlay || !modalTitle || !modalBody) return;

    modalTitle.textContent = `Detalhes da NF: ${item.numero_nota_fiscal}`;

    let detailsHTML = `
        <div class="detail-grid">
            <p><strong>Fornecedor:</strong> ${item.nome_fornecedor}</p>
            <p><strong>Conferente(s):</strong> ${item.conferentes ? item.conferentes.join(', ') : 'N/A'}</p>
            <p><strong>Recebido por:</strong> ${item.recebido_por || 'N/A'}</p>
            <p><strong>Transportadora:</strong> ${item.nome_transportadora || 'N/A'}</p>
            <p><strong>Volumes:</strong> ${item.qtd_volumes || 'N/A'}</p>
            <p><strong>Destino (Rua):</strong> ${item.vendedor_nome || 'N/A'}</p>
            <p><strong>Recebido em:</strong> ${formatarData(item.data_recebimento)}</p>
            <p><strong>Finalizado em:</strong> ${formatarData(item.data_finalizacao)}</p>
        </div>
    `;

    if (item.observacoes && item.observacoes.length > 0) {
        detailsHTML += '<h4>Histórico de Ações</h4>';
        detailsHTML += '<div class="obs-log-container" style="max-height: 250px;">'; // Altura maior no modal
        [...item.observacoes].reverse().forEach(obs => {
            detailsHTML += `<div class="obs-entry"><strong>${obs.autor}:</strong> ${obs.texto}<small>${formatarData(obs.timestamp)}</small></div>`;
        });
        detailsHTML += '</div>';
    }

    modalBody.innerHTML = detailsHTML;
    modalOverlay.style.display = 'flex';
}

// --- Lógica para Reiniciar Conferência (sem alterações) ---
function openReiniciarModal(item) {
    const modalOverlay = document.getElementById('reiniciar-conferencia-modal-overlay');
    const form = document.getElementById('form-reiniciar-conferencia');
    if (!modalOverlay || !form) return;

    form.reset();
    form.dataset.id = item.id;

    const autorInput = document.getElementById('reiniciar-autor');
    if (AppState.currentUser && AppState.currentUser.nome) {
        autorInput.value = AppState.currentUser.nome;
    }

    modalOverlay.style.display = 'flex';
    document.getElementById('reiniciar-motivo').focus();
}

async function handleReiniciarSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const id = form.dataset.id;
    const submitBtn = form.querySelector('button[type="submit"]');

    const dados = {
        autor: document.getElementById('reiniciar-autor').value,
        motivo: document.getElementById('reiniciar-motivo').value
    };

    if (!dados.autor || !dados.motivo) {
        showToast('Por favor, preencha seu nome e o motivo.', 'error');
        return;
    }

    toggleButtonLoading(submitBtn, true, 'Reiniciando...');

    try {
        const response = await fetch(`/api/conferencias/${id}/reiniciar`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Falha ao reiniciar a conferência.');
        }

        showToast('Conferência reiniciada com sucesso! Ela foi movida para o quadro de conferências.', 'success');
        form.closest('.modal-overlay').style.display = 'none';

        document.querySelector(`.card[data-id="${id}"]`)?.remove();

    } catch (error) {
        showToast(`Erro: ${error.message}`, 'error');
    } finally {
        toggleButtonLoading(submitBtn, false, 'Confirmar e Reiniciar');
    }
}

// --- Funções de Renderização e API (sem alterações) ---
function criarCardHistorico(item) {
    const card = document.createElement('div');
    card.className = 'card card--status-done separacao-card';
    card.dataset.id = item.id;

    card.innerHTML = `
        <div class="card__header"><h3>NF: ${item.numero_nota_fiscal}</h3></div>
        <div class="card__body">
            <div class="card-info-grid">
                <p><strong>Fornecedor:</strong> ${item.nome_fornecedor}</p>
                <p><strong>Conferente(s):</strong> ${item.conferentes ? item.conferentes.join(', ') : 'N/A'}</p>
                <p><strong>Recebido:</strong> ${formatarData(item.data_recebimento)}</p>
                <p><strong>Finalizado:</strong> ${formatarData(item.data_finalizacao)}</p>
            </div>
        </div>
        <div class="card__footer">
            <div class="card__actions">
                <button class="btn btn--secondary btn-details">Ver Detalhes</button>
                <button class="btn btn--danger btn-reiniciar">Reiniciar</button> 
            </div>
        </div>
    `;

    card.querySelector('.btn-details').addEventListener('click', () => openDetailsModal(item));
    card.querySelector('.btn-reiniciar').addEventListener('click', () => openReiniciarModal(item));

    return card;
}

function renderizarHistorico(conferencias, limpar = false) {
    if (limpar) {
        elementos.quadro.innerHTML = '';
    }
    if (conferencias.length === 0 && paginaAtual === 0) {
        elementos.quadro.innerHTML = `<p class="quadro-vazio-msg">Nenhuma conferência finalizada encontrada.</p>`;
    }
    conferencias.forEach(item => {
        elementos.quadro.appendChild(criarCardHistorico(item));
    });
}

async function carregarHistorico(recarregar = false) {
    if (carregando || (!temMais && !recarregar)) return;

    carregando = true;
    elementos.spinner.style.display = 'block';
    elementos.btnCarregarMais.style.display = 'none';

    if (recarregar) {
        paginaAtual = 0;
        temMais = true;

        filtrosAtuais = {};
        const nf = document.getElementById('filtro-nf').value;
        const fornecedor = document.getElementById('filtro-fornecedor').value;
        const dataInicio = document.getElementById('filtro-data-inicio').value;
        const dataFim = document.getElementById('filtro-data-fim').value;

        if (nf) filtrosAtuais.nf = nf;
        if (fornecedor) filtrosAtuais.fornecedor = fornecedor;
        if (dataInicio) filtrosAtuais.dataInicio = dataInicio;
        if (dataFim) filtrosAtuais.dataFim = dataFim;
    }

    const body = { ...filtrosAtuais, page: paginaAtual, limit: TAMANHO_PAGINA };

    try {
        const response = await fetch('/api/conferencias/historico', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Falha ao buscar histórico.');

        renderizarHistorico(data.conferencias, recarregar);
        temMais = data.temMais;
        if (temMais) {
            paginaAtual++;
        }

    } catch (error) {
        showToast(`Erro: ${error.message}`, 'error');
        elementos.quadro.innerHTML = `<p class="quadro-vazio-msg" style="color: var(--clr-danger);">Erro ao carregar dados.</p>`;
    } finally {
        carregando = false;
        elementos.spinner.style.display = 'none';
        elementos.btnCarregarMais.style.display = temMais ? 'block' : 'none';
    }
}


// --- Inicialização (sem alterações) ---
export function initHistoricoConferenciasPage() {
    elementos = {
        quadro: document.getElementById('quadro-historico'),
        formFiltros: document.getElementById('form-filtros-historico'),
        btnLimpar: document.getElementById('btn-limpar-filtros'),
        btnCarregarMais: document.getElementById('btn-carregar-mais'),
        spinner: document.getElementById('loading-spinner')
    };
    if (!elementos.quadro) return;

    elementos.formFiltros.addEventListener('submit', (e) => {
        e.preventDefault();
        carregarHistorico(true);
    });

    elementos.btnLimpar.addEventListener('click', () => {
        elementos.formFiltros.reset();
        carregarHistorico(true);
    });

    elementos.btnCarregarMais.addEventListener('click', () => carregarHistorico(false));

    const formReiniciar = document.getElementById('form-reiniciar-conferencia');
    if (formReiniciar) {
        formReiniciar.addEventListener('submit', handleReiniciarSubmit);
    }

    elementos.formFiltros.reset();
    carregarHistorico(true);
}