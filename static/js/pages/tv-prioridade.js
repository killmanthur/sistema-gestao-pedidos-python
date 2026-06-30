// static/js/pages/tv-prioridade.js
import { AppState } from '../state.js';

// Cor de fundo da linha conforme a prioridade (tons suaves, menos saturados).
const CORES = {
    'Prioridade 1': '#df3f3f', // vermelho suave
    'Prioridade 2': '#df8130', // laranja suave
    'Prioridade 3': '#dfbf34', // amarelo suave
    'Prioridade 4': '#3f7fdf', // azul suave
};
// Notas já em conferência vão para o fim da fila com cor própria (verde suave).
const COR_EM_CONFERENCIA = '#4f9f6f';

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function renderTabela(itens) {
    const tbody = document.getElementById('tv-prio-body');
    const vazio = document.getElementById('tv-prio-empty');
    if (!tbody) return;

    tbody.innerHTML = '';
    if (!itens.length) {
        if (vazio) vazio.style.display = 'block';
        return;
    }
    if (vazio) vazio.style.display = 'none';

    itens.forEach(item => {
        const conferindo = item.status === 'Em Conferência';
        const cor = conferindo ? COR_EM_CONFERENCIA : (CORES[item.prioridade] || '#3b82f6');
        const statusCol = conferindo
            ? `<span class="tv-prio-status">EM CONFERÊNCIA</span>
               <span class="tv-prio-conf">${escapeHtml((item.conferentes || []).join(', '))}</span>`
            : `<span class="tv-prio-status tv-prio-status--aguard">AGUARDANDO</span>`;

        const tr = document.createElement('tr');
        tr.className = 'tv-prio-row fade-in';
        tr.style.background = cor;
        tr.innerHTML = `
            <td class="tv-prio-table__prio">${escapeHtml(item.prioridade.replace('Prioridade ', 'P'))}</td>
            <td>${escapeHtml(item.numero_nota_fiscal || '—')}</td>
            <td>${escapeHtml(item.nome_fornecedor || '—')}</td>
            <td>${escapeHtml(item.nome_transportadora || '—')}</td>
            <td class="tv-prio-table__num">${item.qtd_volumes != null ? escapeHtml(item.qtd_volumes) : '—'}</td>
            <td>${escapeHtml(item.recebido_por || '—')}</td>
            <td>${statusCol}</td>
        `;
        tbody.appendChild(tr);
    });
}

async function carregar() {
    try {
        const res = await fetch('/api/conferencias/prioridades/tv');
        const itens = await res.json();
        renderTabela(itens);
    } catch (e) {
        console.error('Erro ao atualizar painel de prioridade:', e);
    }
}

export function initTvPrioridadePage() {
    document.body.classList.add('dark-mode');
    carregar();

    if (AppState.socket) {
        ['prioridade_atualizada', 'conferencia_iniciada', 'conferencia_finalizada',
         'conferencia_editada', 'conferencia_deletada']
            .forEach(ev => AppState.socket.on(ev, carregar));
    }
}
