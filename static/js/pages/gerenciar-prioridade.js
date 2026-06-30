// static/js/pages/gerenciar-prioridade.js
import { AppState } from '../state.js';
import { showToast } from '../toasts.js';
import { formatarData } from '../ui.js';

// Colunas fixas do quadro. A 'chave' é o valor salvo em Conferencia.prioridade.
const COLUNAS = [
    { chave: 'A definir', cor: '#64748b' },     // cinza (ainda sem prioridade)
    { chave: 'Prioridade 1', cor: '#ef4444' },  // vermelho
    { chave: 'Prioridade 2', cor: '#f97316' },  // laranja
    { chave: 'Prioridade 3', cor: '#eab308' },  // amarelo
    { chave: 'Prioridade 4', cor: '#3b82f6' },  // azul
];

let el = {};
let registrosCache = [];   // último estado vindo do servidor
let sortables = [];        // instâncias do SortableJS
let arrastando = false;    // evita re-render durante um drag

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
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

const HORAS_ESCALONAMENTO = 48;

// Texto "sobe de nível em Xh Ym" para prioridades 2/3/4 (P1 não escalona).
function textoEscalonamento(reg) {
    if (!reg.prioridade_definida_em || reg.prioridade === 'Prioridade 1') return '';
    if (!['Prioridade 2', 'Prioridade 3', 'Prioridade 4'].includes(reg.prioridade)) return '';
    const definido = new Date(reg.prioridade_definida_em).getTime();
    if (isNaN(definido)) return '';
    const restanteMs = (definido + HORAS_ESCALONAMENTO * 3600 * 1000) - Date.now();
    if (restanteMs <= 0) {
        return `<div class="prio-card__escala prio-card__escala--vencido">⏫ subindo de nível…</div>`;
    }
    const horas = Math.floor(restanteMs / 3600000);
    const min = Math.floor((restanteMs % 3600000) / 60000);
    const tempo = horas > 0 ? `${horas}h ${min}m` : `${min}m`;
    return `<div class="prio-card__escala">⏫ sobe em ${tempo}</div>`;
}

// ---------------------------------------------------------------------------
// Render do board
// ---------------------------------------------------------------------------
function render() {
    if (arrastando) return;
    sortables.forEach(s => s.destroy());
    sortables = [];
    el.board.innerHTML = '';

    COLUNAS.forEach(col => {
        const cards = registrosCache.filter(r => r.prioridade === col.chave);
        el.board.appendChild(criarColunaEl(col, cards));
    });

    iniciarDragAndDrop();
}

function criarColunaEl(col, cards) {
    const wrap = document.createElement('div');
    wrap.className = 'kanban-coluna prio-coluna';
    wrap.dataset.prioridade = col.chave;

    wrap.innerHTML = `
        <div class="kanban-coluna__header" style="background:${col.cor};color:#fff;">
            <span class="kanban-coluna__nome">${escapeHtml(col.chave)}</span>
            <span class="kanban-coluna__count">${cards.length}</span>
        </div>
        <div class="kanban-cards" data-prioridade="${col.chave}"></div>
    `;

    const cont = wrap.querySelector('.kanban-cards');
    cards.forEach(c => cont.appendChild(criarCardEl(c, col.cor)));
    return wrap;
}

function criarCardEl(reg, cor) {
    const div = document.createElement('div');
    div.className = 'kanban-card prio-card';
    div.dataset.id = reg.id;
    div.style.borderLeft = `5px solid ${cor}`;

    const conferindo = reg.status === 'Em Conferência';
    const badge = conferindo
        ? `<span class="prio-badge prio-badge--conf">Em conferência</span>`
        : `<span class="prio-badge prio-badge--aguard">Aguardando</span>`;
    const conferentes = (conferindo && reg.conferentes && reg.conferentes.length)
        ? `<div class="prio-card__conf">👤 ${escapeHtml(reg.conferentes.join(', '))}</div>`
        : '';
    const escalonamento = textoEscalonamento(reg);

    div.innerHTML = `
        <div class="kanban-card__titulo">NF ${escapeHtml(reg.numero_nota_fiscal || '—')}</div>
        <div class="kanban-card__conteudo">${escapeHtml(reg.nome_fornecedor || 'Sem fornecedor')}</div>
        <div class="prio-card__meta">
            ${reg.qtd_volumes != null ? `<span>📦 ${escapeHtml(reg.qtd_volumes)} vol.</span>` : ''}
            ${reg.recebido_por ? `<span>${escapeHtml(reg.recebido_por)}</span>` : ''}
        </div>
        ${escalonamento}
        ${conferentes}
        <div class="kanban-card__footer">
            <span class="kanban-card__autor">${escapeHtml(formatarData(reg.data_recebimento) || '')}</span>
            ${badge}
        </div>
    `;
    return div;
}

// ---------------------------------------------------------------------------
// Drag and drop (SortableJS)
// ---------------------------------------------------------------------------
function iniciarDragAndDrop() {
    if (typeof Sortable === 'undefined') return;
    el.board.querySelectorAll('.kanban-cards').forEach(cont => {
        sortables.push(new Sortable(cont, {
            group: 'prioridade-cards',
            animation: 150,
            ghostClass: 'kanban-card--ghost',
            dragClass: 'kanban-card--drag',
            onStart: () => { arrastando = true; },
            onEnd: onCardSolto,
        }));
    });
}

async function onCardSolto(evt) {
    arrastando = false;
    const id = Number(evt.item.dataset.id);
    const novaPrioridade = evt.to.dataset.prioridade;
    const reg = registrosCache.find(r => r.id === id);
    // Sem mudança de coluna: nada a fazer.
    if (reg && reg.prioridade === novaPrioridade) return;

    try {
        await api(`/api/conferencias/${id}/prioridade`, {
            method: 'PUT',
            body: JSON.stringify({
                prioridade: novaPrioridade,
                editor_nome: AppState.currentUser?.nome || 'N/A',
            }),
        });
        if (reg) reg.prioridade = novaPrioridade;
        render();   // atualiza contadores e cor da borda
    } catch (e) {
        showToast(e.message, 'error');
        carregar();   // reverte para o estado do servidor
    }
}

// ---------------------------------------------------------------------------
// Carregamento
// ---------------------------------------------------------------------------
async function carregar() {
    try {
        registrosCache = await api('/api/conferencias/prioridades/kanban') || [];
        render();
    } catch (e) {
        showToast('Não foi possível carregar os recebimentos.', 'error');
    } finally {
        el.spinner.style.display = 'none';
        el.board.style.display = 'flex';
    }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
export function initGerenciarPrioridadePage() {
    el = {
        board: document.getElementById('prio-board'),
        spinner: document.getElementById('prio-loading-spinner'),
    };
    if (!el.board) return;

    if (AppState.socket) {
        // Recarrega quando muda prioridade, inicia ou finaliza uma conferência,
        // ou quando chega um novo recebimento.
        ['prioridade_atualizada', 'conferencia_iniciada', 'conferencia_finalizada',
         'novo_recebimento', 'conferencia_editada', 'conferencia_deletada']
            .forEach(ev => AppState.socket.on(ev, carregar));
    }

    // Atualiza o contador de escalonamento a cada minuto (sem bater no servidor).
    setInterval(() => { if (!arrastando) render(); }, 60000);
    // Resync periódico com o servidor (pega escalonamentos automáticos).
    setInterval(carregar, 5 * 60000);

    carregar();
}
