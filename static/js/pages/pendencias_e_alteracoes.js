import { AppState } from '../state.js';
import { showToast } from '../toasts.js';
import { toggleButtonLoading, formatarData, openLogModal } from '../ui.js';

let state = {};
let intervalId = null;

function resetState() {
    state = {
        elementos: {},
        pend_fornecedor: [],
        pend_alteracao: []
    };
}

function criarCardPendencia(item, tipo) {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.id = item.id;

    if (tipo === 'fornecedor') {
        card.classList.add('card--status-danger');
    } else {
        card.classList.add('card--status-info');
    }

    let actions = '';
    const { role } = AppState.currentUser;

    // Define permissões de resolução
    const gestorPodeResolver = ['Admin', 'Estoque'].includes(role);
    const contabPodeResolver = ['Admin', 'Contabilidade'].includes(role);

    if ((tipo === 'fornecedor' && gestorPodeResolver) || (tipo === 'alteracao' && contabPodeResolver)) {
        actions = `<button class="btn btn--primary" data-action="resolver">Resolver</button>`;
    } else {
        actions = `<button class="btn btn--secondary" data-action="resolver">Ver/Atualizar</button>`;
    }

    let observacoesHTML = '';
    if (item.observacoes) {
        observacoesHTML = '<div class="obs-log-container">';
        [...item.observacoes].reverse().forEach(obs => {
            observacoesHTML += `
                <div class="obs-entry">
                    <strong>${obs.autor}:</strong> ${obs.texto}
                    <small>${formatarData(obs.timestamp)}</small>
                </div>`;
        });
        observacoesHTML += '</div>';
    }

    const logBtnHTML = `<button class="btn-icon" data-action="log" title="Histórico"><img src="/static/history.svg" alt="Histórico"></button>`;

    card.innerHTML = `
        <div class="card__header">
            <h3>NF: ${item.numero_nota_fiscal}</h3>
            <div class="card__header-actions">${logBtnHTML}</div>
        </div>
        <div class="card__body">
            <p><strong>Fornecedor:</strong> ${item.nome_fornecedor}</p>
            <p><strong>Conferido por:</strong> ${item.conferentes?.join(', ') || 'N/A'}</p>
            ${observacoesHTML}
        </div>
        <div class="card__footer">
            <div class="card__actions">${actions}</div>
        </div>
    `;

    card.querySelector('[data-action="resolver"]')?.addEventListener('click', () => openResolverModal(item));
    card.querySelector('[data-action="log"]')?.addEventListener('click', () => openLogModal(item.id, 'conferencias'));

    return card;
}

function openResolverModal(item) {
    const modal = state.elementos.resolverModal;
    modal.form.dataset.id = item.id;
    modal.obsInput.value = '';

    const histContainer = modal.form.querySelector('#historico-observacoes');
    histContainer.innerHTML = '<h4>Histórico de Ações:</h4>';

    if (item.observacoes && item.observacoes.length > 0) {
        [...item.observacoes].reverse().forEach(obs => {
            histContainer.innerHTML += `
                <div class="obs-entry">
                    <strong>${obs.autor}:</strong> ${obs.texto}
                    <small>${formatarData(obs.timestamp)}</small>
                </div>`;
        });
    } else {
        histContainer.innerHTML += '<p>Nenhuma observação ainda.</p>';
    }

    modal.overlay.style.display = 'flex';
}

async function fetchData() {
    try {
        const response = await fetch('/api/conferencias/pendentes-e-resolvidas');
        if (!response.ok) throw new Error('Falha ao buscar dados');

        const data = await response.json();

        // Filtra apenas o que ainda não foi resolvido pelo responsável correspondente
        state.pend_fornecedor = data.filter(c =>
            ['Pendente (Fornecedor)', 'Pendente (Ambos)'].includes(c.status) && !c.resolvido_gestor
        );

        state.pend_alteracao = data.filter(c =>
            ['Pendente (Alteração)', 'Pendente (Ambos)'].includes(c.status) && !c.resolvido_contabilidade
        );

        renderizar();
    } catch (e) {
        console.error('Erro ao buscar pendências:', e);
        showToast('Erro ao atualizar dados', 'error');
    }
}

function renderizar() {
    const termo = state.elementos.filtroInput.value.toLowerCase().trim();
    const filterFn = i =>
        i.numero_nota_fiscal.toLowerCase().includes(termo) ||
        i.nome_fornecedor.toLowerCase().includes(termo);

    const { quadroForn, quadroContab } = state.elementos;

    quadroForn.innerHTML = '';
    quadroContab.innerHTML = '';

    const fornFiltrados = state.pend_fornecedor.filter(filterFn);
    const contabFiltrados = state.pend_alteracao.filter(filterFn);

    if (fornFiltrados.length > 0) {
        fornFiltrados.forEach(i => quadroForn.appendChild(criarCardPendencia(i, 'fornecedor')));
    } else {
        quadroForn.innerHTML = '<p class="quadro-vazio-msg">Sem pendências de fornecedor.</p>';
    }

    if (contabFiltrados.length > 0) {
        contabFiltrados.forEach(i => quadroContab.appendChild(criarCardPendencia(i, 'alteracao')));
    } else {
        quadroContab.innerHTML = '<p class="quadro-vazio-msg">Sem solicitações de alteração.</p>';
    }
}

export function initPendenciasEAlteracoesPage() {
    resetState();
    state.elementos = {
        filtroInput: document.getElementById('filtro-pendencias'),
        quadroForn: document.getElementById('quadro-pendencia-fornecedor'),
        quadroContab: document.getElementById('quadro-solicitacao-alteracao'),
        resolverModal: {
            overlay: document.getElementById('resolver-modal-overlay'),
            form: document.getElementById('form-resolver'),
            obsInput: document.getElementById('resolver-observacao'),
            btnAddUpdate: document.getElementById('btn-add-update')
        }
    };

    if (!state.elementos.filtroInput) return;

    state.elementos.filtroInput.addEventListener('input', renderizar);

    // Submissão do formulário de resolução
    state.elementos.resolverModal.form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = e.target.dataset.id;
        const submitBtn = e.target.querySelector('button[type="submit"]');

        const body = {
            observacao: state.elementos.resolverModal.obsInput.value,
            editor_nome: AppState.currentUser.nome,
            user_role: AppState.currentUser.role
        };

        toggleButtonLoading(submitBtn, true, 'Resolvendo...');
        try {
            const res = await fetch(`/api/conferencias/${id}/resolver-item`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (res.ok) {
                showToast('Item marcado como resolvido!', 'success');
                state.elementos.resolverModal.overlay.style.display = 'none';
                fetchData();
            } else {
                const err = await res.json();
                showToast(err.error, 'error');
            }
        } catch (error) {
            showToast('Erro de conexão', 'error');
        } finally {
            toggleButtonLoading(submitBtn, false, 'Marcar como Resolvido');
        }
    });

    // Botão de apenas adicionar observação
    state.elementos.resolverModal.btnAddUpdate.addEventListener('click', async () => {
        const id = state.elementos.resolverModal.form.dataset.id;
        const texto = state.elementos.resolverModal.obsInput.value;
        if (!texto.trim()) return showToast('Digite uma observação', 'error');

        toggleButtonLoading(state.elementos.resolverModal.btnAddUpdate, true, 'Salvando...');
        try {
            const res = await fetch(`/api/conferencias/${id}/observacao`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ texto, autor: AppState.currentUser.nome })
            });
            if (res.ok) {
                showToast('Observação adicionada!');
                state.elementos.resolverModal.obsInput.value = '';
                fetchData();
            }
        } catch (error) {
            showToast('Erro ao salvar observação', 'error');
        } finally {
            toggleButtonLoading(state.elementos.resolverModal.btnAddUpdate, false, 'Apenas Adicionar Observação');
        }
    });

    fetchData();
    if (intervalId) clearInterval(intervalId);
    intervalId = setInterval(fetchData, 15000);
}