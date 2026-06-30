// static/js/pages/garantias-finalizadas.js
import { AppState } from '../state.js';
import { showToast } from '../toasts.js';
import { formatarData, toggleButtonLoading, showConfirmModal } from '../ui.js';

let elementos = {};
let todos = [];
let termoBusca = '';
let filtroStatus = '';
let podeReabrir = false;
let podeExcluir = false;
let garantiaAtual = null;

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatarDataSimples(data) {
    if (!data) return '-';
    const p = String(data).slice(0, 10).split('-');
    if (p.length === 3) return `${p[2]}/${p[1]}/${p[0]}`;
    return data;
}

const BADGE_CLASSE = {
    Concedida: 'gar-badge--concedida',
    Recusada: 'gar-badge--recusada',
    Abandono: 'gar-badge--abandono',
};

function badge(status) {
    const cls = BADGE_CLASSE[status] || 'gar-badge--abandono';
    return `<span class="gar-badge ${cls}">${escapeHtml(status)}</span>`;
}

function renderTabela(registros) {
    const tbody = elementos.tbody;
    tbody.innerHTML = '';

    if (!registros || registros.length === 0) {
        tbody.innerHTML = `<tr><td colspan="12" style="text-align:center; padding:2rem;">Nenhuma garantia finalizada encontrada.</td></tr>`;
        return;
    }

    registros.forEach(g => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${escapeHtml(g.nome_cliente)}</strong></td>
            <td>${escapeHtml(g.codigo_peca)}</td>
            <td>${escapeHtml(g.descricao_peca) || '-'}</td>
            <td>${escapeHtml(g.marca) || '-'}</td>
            <td>${escapeHtml(g.fornecedor) || '-'}</td>
            <td style="text-align:center;">${g.quantidade ?? 1}</td>
            <td>${badge(g.status)}</td>
            <td>${escapeHtml(g.conclusao) || '-'}</td>
            <td>${formatarDataSimples(g.data_inicio)}</td>
            <td>${formatarDataSimples(g.data_final)}</td>
            <td>${escapeHtml(g.tempo_decorrido)}</td>
            <td><div class="actions-cell">
                <button class="btn-action" data-action="abrir" data-id="${g.id}">Abrir</button>
                ${podeReabrir ? `<button class="btn-action" data-action="reabrir" data-id="${g.id}">Reabrir</button>` : ''}
                ${podeExcluir ? `<button class="btn-action btn-delete btn-delete--icon" data-action="excluir" data-id="${g.id}" title="Excluir">X</button>` : ''}
            </div></td>
        `;
        tbody.appendChild(tr);
    });
}

function aplicarFiltro() {
    const q = termoBusca.trim().toLowerCase();
    let lista = todos;
    if (filtroStatus) lista = lista.filter(g => g.status === filtroStatus);
    if (q) {
        lista = lista.filter(g => {
            const campos = [g.nome_cliente, g.codigo_peca, g.descricao_peca, g.marca, g.fornecedor, g.defeito, g.conclusao];
            return campos.some(c => String(c || '').toLowerCase().includes(q));
        });
    }
    renderTabela(lista);
}

async function carregar() {
    elementos.spinner.style.display = 'block';
    elementos.tabela.style.display = 'none';
    try {
        const res = await fetch('/api/garantias?aba=finalizadas');
        if (!res.ok) throw new Error('Falha ao carregar.');
        const data = await res.json();
        podeReabrir = !!data.pode_reabrir;
        podeExcluir = !!data.pode_reabrir; // mesma permissão da aba de finalizadas
        todos = data.registros || [];
        aplicarFiltro();
    } catch (e) {
        showToast('Não foi possível carregar as garantias finalizadas.', 'error');
    } finally {
        elementos.spinner.style.display = 'none';
        elementos.tabela.style.display = 'table';
    }
}

function abrirModal(id) {
    const g = todos.find(x => x.id === Number(id));
    if (!g) return;
    garantiaAtual = g;

    document.getElementById('garantia-fin-modal-title').textContent =
        `Garantia — ${g.nome_cliente || ''} (${g.codigo_peca || ''})`;

    const det = document.getElementById('garantia-fin-detalhes');
    const linha = (rotulo, valor) =>
        `<div class="garantia-det-linha"><span class="garantia-det-rotulo">${rotulo}</span><span class="garantia-det-valor">${valor}</span></div>`;
    det.innerHTML = [
        linha('Status', badge(g.status)),
        linha('Cliente', escapeHtml(g.nome_cliente) || '-'),
        linha('Código', escapeHtml(g.codigo_peca) || '-'),
        linha('Descrição', escapeHtml(g.descricao_peca) || '-'),
        linha('Marca', escapeHtml(g.marca) || '-'),
        linha('Fornecedor', escapeHtml(g.fornecedor) || '-'),
        linha('Defeito', escapeHtml(g.defeito) || '-'),
        linha('Quantidade', g.quantidade ?? 1),
        linha('Data Início', formatarDataSimples(g.data_inicio)),
        linha('Envio Fornecedor', formatarDataSimples(g.data_envio_fornecedor)),
        linha('Último Contato', formatarDataSimples(g.ultimo_contato)),
        linha('Data Final', formatarDataSimples(g.data_final)),
        linha('Tempo Decorrido', escapeHtml(g.tempo_decorrido)),
        linha('Conclusão', escapeHtml(g.conclusao) || '-'),
        linha('Finalizado por', g.finalizado_por ? `${escapeHtml(g.finalizado_por)} em ${formatarData(g.finalizado_em)}` : '-'),
    ].join('');

    renderTimeline(g);

    const btnReabrir = document.getElementById('btn-reabrir-garantia');
    btnReabrir.style.display = podeReabrir ? '' : 'none';

    document.getElementById('garantia-fin-modal-overlay').style.display = 'flex';
}

function renderTimeline(g) {
    const lista = document.getElementById('gf-acomp-lista');
    const entradas = g.acompanhamento || [];
    if (entradas.length === 0) {
        lista.innerHTML = `<li class="garantia-timeline-empty">Nenhum acompanhamento registrado.</li>`;
        return;
    }
    lista.innerHTML = entradas.slice().reverse().map(e => {
        const editado = e.editado_em
            ? ` <em>(editado por ${escapeHtml(e.editado_por || '')} em ${formatarData(e.editado_em)})</em>`
            : '';
        return `<li class="garantia-timeline-item">
            <div class="garantia-timeline-head">
                <span class="garantia-timeline-autor">${escapeHtml(e.autor || 'N/A')}</span>
                <span class="garantia-timeline-data">${formatarData(e.timestamp)}${editado}</span>
            </div>
            <div class="garantia-timeline-texto">${escapeHtml(e.texto).replace(/\n/g, '<br>')}</div>
        </li>`;
    }).join('');
}

async function reabrir(id) {
    const alvo = id || (garantiaAtual && garantiaAtual.id);
    if (!alvo) return;
    showConfirmModal('Reabrir este processo? Ele voltará para a aba de Garantias (Pendentes).', async () => {
        try {
            const res = await fetch(`/api/garantias/${alvo}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'Pendente' }),
            });
            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Falha ao reabrir.');
            }
            showToast('Garantia reaberta (Pendente).', 'success');
            document.getElementById('garantia-fin-modal-overlay').style.display = 'none';
            garantiaAtual = null;
            carregar();
        } catch (e) {
            showToast(e.message, 'error');
        }
    });
}

async function excluir(id) {
    showConfirmModal('Excluir definitivamente esta garantia finalizada?', async () => {
        try {
            const res = await fetch(`/api/garantias/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Falha ao excluir.');
            showToast('Garantia excluída.', 'success');
            carregar();
        } catch (e) {
            showToast('Não foi possível excluir.', 'error');
        }
    });
}

export async function initGarantiasFinalizadasPage() {
    elementos = {
        tabela: document.getElementById('tabela-garantias-finalizadas'),
        tbody: document.getElementById('tabela-garantias-finalizadas-body'),
        spinner: document.getElementById('gf-loading-spinner'),
        busca: document.getElementById('gf-busca'),
        filtro: document.getElementById('gf-filtro-status'),
    };
    if (!elementos.tabela) return;

    elementos.busca?.addEventListener('input', (e) => {
        termoBusca = e.target.value;
        aplicarFiltro();
    });
    elementos.filtro?.addEventListener('change', (e) => {
        filtroStatus = e.target.value;
        aplicarFiltro();
    });

    elementos.tbody.addEventListener('click', (e) => {
        const abrir = e.target.closest('[data-action="abrir"]');
        if (abrir) { abrirModal(abrir.dataset.id); return; }
        const reab = e.target.closest('[data-action="reabrir"]');
        if (reab) { reabrir(reab.dataset.id); return; }
        const del = e.target.closest('[data-action="excluir"]');
        if (del) excluir(del.dataset.id);
    });

    document.getElementById('btn-reabrir-garantia')?.addEventListener('click', () => reabrir());

    // Fechamento do modal (overlay, botão × e Esc) é tratado globalmente por
    // setupAllModalCloseHandlers (ui.js).

    if (AppState.socket) {
        AppState.socket.on('garantias_atualizado', carregar);
    }

    carregar();
}
