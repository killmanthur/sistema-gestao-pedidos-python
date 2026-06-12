import { AppState } from '../state.js';
import { showToast } from '../toasts.js';
import { toggleButtonLoading, formatarData, openLogModal } from '../ui.js';

let state = {};

function resetState() {
    state = {
        elementos: {},
        pend_fornecedor: [],
        pend_alteracao: []
    };
}

// Observações geradas pelo sistema não têm lápis (preserva o histórico).
const PREFIXOS_SISTEMA = ['[RESOLVIDO]', '[DIVERGÊNCIA]', '[OBS INICIAL]'];
function isObsSistema(texto) {
    const t = (texto || '').trimStart();
    return PREFIXOS_SISTEMA.some(p => t.startsWith(p));
}

/** Renderiza UMA entrada de observação.
 *  indiceReal = posição na lista original (necessário para editar).
 *  editavel = mostra o lápis (apenas no modal, em obs comuns). */
function renderObsEntry(obs, indiceReal, editavel) {
    const lapis = (editavel && !isObsSistema(obs.texto))
        ? `<button class="btn-icon btn-edit-obs" data-action="editar-obs" data-index="${indiceReal}" title="Editar observação"><img src="/static/edit.svg" alt="Editar"></button>`
        : '';
    return `<div class="obs-entry" data-index="${indiceReal}">`
        + `<div class="obs-entry__head"><strong>${obs.autor}:</strong> <span class="obs-texto">${obs.texto}</span>${lapis}</div>`
        + `<small>${formatarData(obs.timestamp)}${obs.editado_em ? ' (editado)' : ''}</small>`
        + `</div>`;
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
        actions = `<button class="btn btn--edit" data-action="resolver">Resolver</button>`;
    } else {
        actions = `<button class="btn btn--secondary" data-action="resolver">Ver/Atualizar</button>`;
    }

    let observacoesHTML = '';
    if (item.observacoes) {
        // Render do mais novo para o mais antigo, preservando o índice real.
        observacoesHTML = '<div class="obs-log-container">'
            + item.observacoes
                .map((obs, i) => ({ obs, i }))
                .reverse()
                .map(({ obs, i }) => renderObsEntry(obs, i, false))
                .join('')
            + '</div>';
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

/** Pinta o histórico de observações no container do modal (com lápis). */
function pintarHistorico(item, histContainer) {
    histContainer.innerHTML = '<h4>Histórico de Ações:</h4>';
    if (item && item.observacoes && item.observacoes.length > 0) {
        histContainer.innerHTML += item.observacoes
            .map((obs, i) => ({ obs, i }))
            .reverse()
            .map(({ obs, i }) => renderObsEntry(obs, i, true))
            .join('');
    } else {
        histContainer.innerHTML += '<p>Nenhuma observação ainda.</p>';
    }
}

function openResolverModal(item) {
    const modal = state.elementos.resolverModal;
    modal.form.dataset.id = item.id;
    modal.obsInput.value = '';
    pintarHistorico(item, modal.form.querySelector('#historico-observacoes'));
    modal.overlay.style.display = 'flex';
}

/** Após adicionar/editar uma observação, repinta o histórico no modal já
 *  aberto com o item atualizado (sem fechar/reabrir manualmente). */
function reabrirHistoricoAtual(id) {
    const todos = [...(state.pend_fornecedor || []), ...(state.pend_alteracao || [])];
    const item = todos.find(c => String(c.id) === String(id));
    pintarHistorico(item, state.elementos.resolverModal.form.querySelector('#historico-observacoes'));
}

/** Transforma uma entrada de observação em modo de edição inline. */
function iniciarEdicaoObs(entryEl) {
    if (!entryEl || entryEl.querySelector('.obs-edit-area')) return;
    const indice = entryEl.dataset.index;
    const textoAtual = entryEl.querySelector('.obs-texto')?.textContent || '';
    const head = entryEl.querySelector('.obs-entry__head');

    head.style.display = 'none';
    const editor = document.createElement('div');
    editor.className = 'obs-edit-area';
    editor.innerHTML = `
        <textarea class="obs-edit-textarea" rows="3">${textoAtual}</textarea>
        <div class="obs-edit-actions">
            <button type="button" class="btn btn-sm btn--secondary obs-edit-cancel">Cancelar</button>
            <button type="button" class="btn btn-sm btn--primary obs-edit-save">Salvar</button>
        </div>`;
    entryEl.insertBefore(editor, entryEl.querySelector('small'));

    const textarea = editor.querySelector('.obs-edit-textarea');
    textarea.focus();

    const cancelar = () => { editor.remove(); head.style.display = ''; };
    editor.querySelector('.obs-edit-cancel').onclick = cancelar;
    editor.querySelector('.obs-edit-save').onclick = async () => {
        const novo = textarea.value.trim();
        if (!novo) return showToast('O texto não pode ficar vazio.', 'error');
        const id = state.elementos.resolverModal.form.dataset.id;
        const saveBtn = editor.querySelector('.obs-edit-save');
        toggleButtonLoading(saveBtn, true, 'Salvando...');
        try {
            const res = await fetch(`/api/conferencias/${id}/observacao/${indice}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ texto: novo, autor: AppState.currentUser.nome })
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Falha ao editar.');
            }
            showToast('Observação atualizada!', 'success');
            await fetchData();
            reabrirHistoricoAtual(id);
        } catch (err) {
            showToast(err.message, 'error');
            toggleButtonLoading(saveBtn, false, 'Salvar');
        }
    };
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

    // Edição individual de observação (lápis) no histórico do modal.
    const histContainer = state.elementos.resolverModal.form.querySelector('#historico-observacoes');
    histContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action="editar-obs"]');
        if (btn) iniciarEdicaoObs(btn.closest('.obs-entry'));
    });

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
                await fetchData();
                // Re-renderiza o histórico no modal aberto com o item atualizado.
                reabrirHistoricoAtual(id);
            }
        } catch (error) {
            showToast('Erro ao salvar observação', 'error');
        } finally {
            toggleButtonLoading(state.elementos.resolverModal.btnAddUpdate, false, 'Apenas Adicionar Observação');
        }
    });

    fetchData();
}