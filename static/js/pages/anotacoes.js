// static/js/pages/anotacoes.js
import { AppState } from '../state.js';
import { showToast } from '../toasts.js';
import { showConfirmModal, toggleButtonLoading } from '../ui.js';

const CORES_PRESET = [
    '#6366f1', '#0ea5e9', '#10b981', '#f59e0b',
    '#ef4444', '#ec4899', '#8b5cf6', '#64748b',
];

let el = {};
let colunasCache = [];          // último estado vindo do servidor
let sortables = [];             // instâncias do SortableJS (cards)
let sortableBoard = null;       // Sortable das colunas
let arrastando = false;         // evita re-render durante um drag
let editColunaId = null;        // id da coluna em edição (null = criando)
let editCardId = null;          // id do card em edição (null = criando)
let novoCardColunaId = null;    // coluna alvo ao criar card

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// Cor de texto legível (preto/branco) conforme a luminância do fundo.
function corTexto(hex) {
    if (!hex) return '#1e293b';
    const c = hex.replace('#', '');
    if (c.length < 6) return '#1e293b';
    const r = parseInt(c.slice(0, 2), 16);
    const g = parseInt(c.slice(2, 4), 16);
    const b = parseInt(c.slice(4, 6), 16);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.6 ? '#1e293b' : '#ffffff';
}

async function api(url, opcoes = {}) {
    const res = await fetch(url, {
        headers: { 'Content-Type': 'application/json' },
        ...opcoes,
    });
    if (!res.ok) {
        let msg = 'Falha na operação.';
        try { msg = (await res.json()).error || msg; } catch (e) { /* noop */ }
        throw new Error(msg);
    }
    return res.status === 204 ? null : res.json();
}

// ---------------------------------------------------------------------------
// Render do board
// ---------------------------------------------------------------------------
function render() {
    if (arrastando) return;   // não rebuilda enquanto o usuário arrasta
    // Limpa instâncias antigas do Sortable.
    sortables.forEach(s => s.destroy());
    sortables = [];
    if (sortableBoard) { sortableBoard.destroy(); sortableBoard = null; }

    el.board.innerHTML = '';

    colunasCache.forEach(col => {
        el.board.appendChild(criarColunaEl(col));
    });

    // Botão fantasma "+ coluna" no fim (atalho)
    const addCol = document.createElement('button');
    addCol.className = 'kanban-add-coluna';
    addCol.innerHTML = '<span>+</span> Nova coluna';
    addCol.addEventListener('click', () => abrirModalColuna(null));
    el.board.appendChild(addCol);

    iniciarDragAndDrop();
}

function criarColunaEl(col) {
    const corTxt = corTexto(col.cor);
    const wrap = document.createElement('div');
    wrap.className = 'kanban-coluna';
    wrap.dataset.colunaId = col.id;

    wrap.innerHTML = `
        <div class="kanban-coluna__header" style="background:${col.cor};color:${corTxt};">
            <span class="kanban-coluna__drag" title="Arraste para reordenar">⠿</span>
            <span class="kanban-coluna__nome">${escapeHtml(col.nome)}</span>
            <span class="kanban-coluna__count">${col.cards.length}</span>
            <div class="kanban-coluna__acoes">
                <button class="kanban-icon-btn" data-acao="editar-coluna" title="Editar coluna" style="color:${corTxt};">✎</button>
                <button class="kanban-icon-btn" data-acao="excluir-coluna" title="Excluir coluna" style="color:${corTxt};">×</button>
            </div>
        </div>
        <div class="kanban-cards" data-coluna-id="${col.id}"></div>
        <button class="kanban-add-card" data-acao="novo-card">+ Anotação</button>
    `;

    const cardsCont = wrap.querySelector('.kanban-cards');
    col.cards.forEach(card => cardsCont.appendChild(criarCardEl(card)));

    // Ações da coluna
    wrap.querySelector('[data-acao="editar-coluna"]').addEventListener('click', () => abrirModalColuna(col));
    wrap.querySelector('[data-acao="excluir-coluna"]').addEventListener('click', () => excluirColuna(col));
    wrap.querySelector('[data-acao="novo-card"]').addEventListener('click', () => abrirModalCard(col.id, null));

    return wrap;
}

function criarCardEl(card) {
    const div = document.createElement('div');
    div.className = 'kanban-card';
    div.dataset.cardId = card.id;
    if (card.cor) {
        div.style.background = card.cor;
        div.style.color = corTexto(card.cor);
    }
    const titulo = card.titulo ? `<div class="kanban-card__titulo">${escapeHtml(card.titulo)}</div>` : '';
    const conteudo = card.conteudo ? `<div class="kanban-card__conteudo">${escapeHtml(card.conteudo)}</div>` : '';
    div.innerHTML = `
        ${titulo}
        ${conteudo}
        <div class="kanban-card__footer">
            <span class="kanban-card__autor">${escapeHtml(card.criado_por || '')}</span>
            <div class="kanban-card__acoes">
                <button class="kanban-icon-btn" data-acao="editar-card" title="Editar">✎</button>
                <button class="kanban-icon-btn" data-acao="excluir-card" title="Excluir">×</button>
            </div>
        </div>
    `;
    div.querySelector('[data-acao="editar-card"]').addEventListener('click', () => abrirModalCard(card.coluna_id, card));
    div.querySelector('[data-acao="excluir-card"]').addEventListener('click', () => excluirCard(card));
    return div;
}

// ---------------------------------------------------------------------------
// Drag and drop (SortableJS)
// ---------------------------------------------------------------------------
function iniciarDragAndDrop() {
    if (typeof Sortable === 'undefined') return;

    // Cards: movem entre colunas (grupo compartilhado).
    el.board.querySelectorAll('.kanban-cards').forEach(cont => {
        sortables.push(new Sortable(cont, {
            group: 'anotacoes-cards',
            animation: 150,
            ghostClass: 'kanban-card--ghost',
            dragClass: 'kanban-card--drag',
            onStart: () => { arrastando = true; },
            onEnd: onCardSolto,
        }));
    });

    // Colunas: reordenáveis arrastando pelo "punho" do header.
    sortableBoard = new Sortable(el.board, {
        group: 'anotacoes-colunas',
        animation: 150,
        draggable: '.kanban-coluna',
        handle: '.kanban-coluna__drag',
        onStart: () => { arrastando = true; },
        onEnd: onColunaSolta,
    });
}

async function onCardSolto(evt) {
    arrastando = false;
    const cardId = Number(evt.item.dataset.cardId);
    const destCont = evt.to;
    const colunaId = Number(destCont.dataset.colunaId);
    const ordem = Array.from(destCont.querySelectorAll('.kanban-card'))
        .map(c => Number(c.dataset.cardId));
    try {
        await api('/api/anotacoes/cards/mover', {
            method: 'PUT',
            body: JSON.stringify({ card_id: cardId, coluna_id: colunaId, ordem }),
        });
    } catch (e) {
        showToast(e.message, 'error');
        carregar();   // reverte para o estado do servidor
    }
}

async function onColunaSolta() {
    arrastando = false;
    const ordem = Array.from(el.board.querySelectorAll('.kanban-coluna'))
        .map(c => Number(c.dataset.colunaId));
    try {
        await api('/api/anotacoes/colunas/ordem', {
            method: 'PUT',
            body: JSON.stringify({ ordem }),
        });
    } catch (e) {
        showToast(e.message, 'error');
        carregar();
    }
}

// ---------------------------------------------------------------------------
// Carregamento
// ---------------------------------------------------------------------------
async function carregar() {
    try {
        const data = await api('/api/anotacoes');
        colunasCache = data.colunas || [];
        render();
    } catch (e) {
        showToast('Não foi possível carregar as anotações.', 'error');
    } finally {
        el.spinner.style.display = 'none';
        el.board.style.display = 'flex';
    }
}

// ---------------------------------------------------------------------------
// Colunas — modal
// ---------------------------------------------------------------------------
function abrirModalColuna(col) {
    editColunaId = col ? col.id : null;
    el.colunaTitle.textContent = col ? 'Editar Coluna' : 'Nova Coluna';
    el.colunaNome.value = col ? col.nome : '';
    el.colunaCor.value = col ? (col.cor || '#6366f1') : '#6366f1';
    el.colunaOverlay.style.display = 'flex';
    setTimeout(() => el.colunaNome.focus(), 50);
}

async function salvarColuna(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    toggleButtonLoading(btn, true, 'Salvar');
    const body = { nome: el.colunaNome.value.trim(), cor: el.colunaCor.value };
    try {
        if (editColunaId) {
            await api(`/api/anotacoes/colunas/${editColunaId}`, { method: 'PUT', body: JSON.stringify(body) });
        } else {
            await api('/api/anotacoes/colunas', { method: 'POST', body: JSON.stringify(body) });
        }
        el.colunaOverlay.style.display = 'none';
        carregar();
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        toggleButtonLoading(btn, false, 'Salvar');
    }
}

function excluirColuna(col) {
    const aviso = col.cards.length
        ? `Excluir a coluna "${col.nome}" e suas ${col.cards.length} anotação(ões)?`
        : `Excluir a coluna "${col.nome}"?`;
    showConfirmModal(aviso, async () => {
        try {
            await api(`/api/anotacoes/colunas/${col.id}`, { method: 'DELETE' });
            showToast('Coluna excluída.', 'success');
            carregar();
        } catch (e) {
            showToast(e.message, 'error');
        }
    });
}

// ---------------------------------------------------------------------------
// Cards — modal
// ---------------------------------------------------------------------------
function abrirModalCard(colunaId, card) {
    editCardId = card ? card.id : null;
    novoCardColunaId = colunaId;
    el.cardTitle.textContent = card ? 'Editar Anotação' : 'Nova Anotação';
    el.cardTitulo.value = card ? (card.titulo || '') : '';
    el.cardConteudo.value = card ? (card.conteudo || '') : '';
    el.cardCor.value = card && card.cor ? card.cor : '#ffffff';
    el.cardCor.dataset.usar = card && card.cor ? '1' : '';
    el.cardOverlay.style.display = 'flex';
    setTimeout(() => el.cardTitulo.focus(), 50);
}

async function salvarCard(e) {
    e.preventDefault();
    const titulo = el.cardTitulo.value.trim();
    const conteudo = el.cardConteudo.value.trim();
    if (!titulo && !conteudo) {
        showToast('Informe um título ou conteúdo.', 'error');
        return;
    }
    const btn = e.target.querySelector('button[type="submit"]');
    toggleButtonLoading(btn, true, 'Salvar');
    const cor = el.cardCor.dataset.usar ? el.cardCor.value : null;
    const body = { titulo, conteudo, cor };
    try {
        if (editCardId) {
            await api(`/api/anotacoes/cards/${editCardId}`, { method: 'PUT', body: JSON.stringify(body) });
        } else {
            body.coluna_id = novoCardColunaId;
            await api('/api/anotacoes/cards', { method: 'POST', body: JSON.stringify(body) });
        }
        el.cardOverlay.style.display = 'none';
        carregar();
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        toggleButtonLoading(btn, false, 'Salvar');
    }
}

function excluirCard(card) {
    showConfirmModal('Excluir esta anotação?', async () => {
        try {
            await api(`/api/anotacoes/cards/${card.id}`, { method: 'DELETE' });
            showToast('Anotação excluída.', 'success');
            carregar();
        } catch (e) {
            showToast(e.message, 'error');
        }
    });
}

// ---------------------------------------------------------------------------
// Presets de cor
// ---------------------------------------------------------------------------
function montarPresets(container, inputColor, onPick) {
    container.innerHTML = '';
    CORES_PRESET.forEach(cor => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'cor-preset';
        b.style.background = cor;
        b.title = cor;
        b.addEventListener('click', () => {
            inputColor.value = cor;
            if (onPick) onPick();
        });
        container.appendChild(b);
    });
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
export function initAnotacoesPage() {
    el = {
        board: document.getElementById('anot-board'),
        spinner: document.getElementById('anot-loading-spinner'),
        btnNovaColuna: document.getElementById('btn-nova-coluna'),
        // modal coluna
        colunaOverlay: document.getElementById('coluna-modal-overlay'),
        colunaTitle: document.getElementById('coluna-modal-title'),
        formColuna: document.getElementById('form-coluna'),
        colunaNome: document.getElementById('coluna-nome'),
        colunaCor: document.getElementById('coluna-cor'),
        colunaPresets: document.getElementById('coluna-cor-presets'),
        // modal card
        cardOverlay: document.getElementById('card-modal-overlay'),
        cardTitle: document.getElementById('card-modal-title'),
        formCard: document.getElementById('form-card'),
        cardTitulo: document.getElementById('card-titulo'),
        cardConteudo: document.getElementById('card-conteudo'),
        cardCor: document.getElementById('card-cor'),
        cardPresets: document.getElementById('card-cor-presets'),
        cardCorLimpar: document.getElementById('card-cor-limpar'),
    };
    if (!el.board) return;

    el.btnNovaColuna.addEventListener('click', () => abrirModalColuna(null));
    el.formColuna.addEventListener('submit', salvarColuna);
    el.formCard.addEventListener('submit', salvarCard);

    // Presets de cor
    montarPresets(el.colunaPresets, el.colunaCor);
    montarPresets(el.cardPresets, el.cardCor, () => { el.cardCor.dataset.usar = '1'; });
    el.cardCor.addEventListener('input', () => { el.cardCor.dataset.usar = '1'; });
    el.cardCorLimpar.addEventListener('click', () => {
        el.cardCor.value = '#ffffff';
        el.cardCor.dataset.usar = '';
    });

    // Fecha modais ao clicar fora ou no X (reaproveita .close-modal global,
    // mas garante o clique no overlay também).
    [el.colunaOverlay, el.cardOverlay].forEach(ov => {
        ov.addEventListener('click', (e) => {
            if (e.target === ov || e.target.closest('.close-modal')) {
                ov.style.display = 'none';
            }
        });
    });

    // Atualização em tempo real (outros usuários editando o quadro).
    if (AppState.socket) {
        AppState.socket.on('anotacoes_atualizado', carregar);
    }

    carregar();
}
