// static/js/pages/auditoria-compras.js
import { AppState } from '../state.js';
import { showToast } from '../toasts.js';
import { formatarData } from '../ui.js';

let els = {};
let abaAtual = 'pedidos';

const STATUS_COLORS = {
    'Aguardando': 'bg-status-awaiting',
    'Em Cotação': 'bg-status-progress',
    'Pedido Efetuado': 'bg-status-success'
};

async function carregarCompradores() {
    try {
        const res = await fetch('/api/usuarios/comprador-nomes');
        const compradores = await res.json();
        els.filtroComprador.innerHTML = '<option value="">Todos os Compradores</option>' +
            compradores.map(n => `<option value="${n}">${n}</option>`).join('');
    } catch (e) { console.error(e); }
}

function montarQueryString() {
    const params = new URLSearchParams();
    const comp = els.filtroComprador.value.trim();
    const forn = els.filtroFornecedor.value.trim();
    const dIni = els.filtroDataInicio.value;
    const dFim = els.filtroDataFim.value;
    const stat = els.filtroStatus.value;
    if (comp) params.set('comprador', comp);
    if (forn) params.set('fornecedor', forn);
    if (dIni) params.set('dataInicio', dIni);
    if (dFim) params.set('dataFim', dFim);
    if (stat) params.set('status', stat);
    return params.toString();
}

async function carregarAuditoria() {
    try {
        const qs = montarQueryString();
        const res = await fetch('/api/registro-compras/auditoria' + (qs ? '?' + qs : ''));
        if (res.status === 403) {
            els.cards.innerHTML = '';
            els.tabelaBody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:2rem;">Acesso restrito ao gestor de compras.</td></tr>';
            return;
        }
        if (!res.ok) throw new Error('Falha ao carregar auditoria');
        const data = await res.json();
        renderCards(data.medias);
        renderTabela(data.registros);
        renderMedias(data.medias);
    } catch (e) {
        showToast(e.message || 'Erro ao carregar auditoria', 'error');
    }
}

function renderCards(m) {
    els.cards.innerHTML = `
        <div class="auditoria-card">
            <span class="auditoria-card__valor">${m.total_auditaveis}</span>
            <span class="auditoria-card__label">Registros auditáveis</span>
        </div>
        <div class="auditoria-card">
            <span class="auditoria-card__valor">${m.total_finalizados}</span>
            <span class="auditoria-card__label">Finalizados</span>
        </div>
        <div class="auditoria-card">
            <span class="auditoria-card__valor">${m.total_em_andamento}</span>
            <span class="auditoria-card__label">Em andamento</span>
        </div>
        <div class="auditoria-card auditoria-card--destaque">
            <span class="auditoria-card__valor">${m.duracao_media_texto}</span>
            <span class="auditoria-card__label">Tempo médio até finalizar</span>
        </div>
        <div class="auditoria-card">
            <span class="auditoria-card__valor">${m.duracao_min_texto}</span>
            <span class="auditoria-card__label">Mais rápido</span>
        </div>
        <div class="auditoria-card">
            <span class="auditoria-card__valor">${m.duracao_max_texto}</span>
            <span class="auditoria-card__label">Mais lento</span>
        </div>
    `;
}

function renderTabela(registros) {
    if (!registros.length) {
        els.tabelaBody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:2rem;">' +
            'Nenhum registro auditável para os filtros aplicados.<br>' +
            '<small>Registros criados antes deste módulo não possuem dados de auditoria.</small></td></tr>';
        return;
    }
    els.tabelaBody.innerHTML = registros.map(r => `
        <tr>
            <td>${formatarData(r.criado_em)}</td>
            <td><strong>${r.fornecedor}</strong></td>
            <td>${r.comprador_nome || '<span style="color:var(--clr-danger);">Em Aberto</span>'}</td>
            <td><span class="badge-status ${STATUS_COLORS[r.status_atual] || ''}">${r.status_atual}</span></td>
            <td>${r.finalizado_em ? formatarData(r.finalizado_em) : '—'}</td>
            <td>${r.finalizado
                ? `<strong>${r.duracao_texto}</strong>`
                : '<span style="color:var(--text-secondary,#888);">em andamento</span>'}</td>
            <td class="actions-cell">
                <button class="btn-action btn-edit" data-detalhe="${r.id}">Detalhes</button>
            </td>
        </tr>
    `).join('');
}

function renderMedias(m) {
    if (!m.por_comprador.length) {
        els.mediasCompradorBody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:1.5rem;">Sem pedidos finalizados.</td></tr>';
    } else {
        els.mediasCompradorBody.innerHTML = m.por_comprador.map(g => `
            <tr>
                <td><strong>${g.nome}</strong></td>
                <td>${g.qtd}</td>
                <td>${g.media_texto}</td>
            </tr>
        `).join('');
    }
    if (!m.por_fornecedor.length) {
        els.mediasFornecedorBody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:1.5rem;">Sem pedidos finalizados.</td></tr>';
    } else {
        els.mediasFornecedorBody.innerHTML = m.por_fornecedor.map(g => `
            <tr>
                <td><strong>${g.nome}</strong></td>
                <td>${g.qtd}</td>
                <td>${g.media_texto}</td>
            </tr>
        `).join('');
    }
}

async function abrirDetalhe(id) {
    els.detalheModal.style.display = 'flex';
    els.detalheBody.innerHTML = '<p>Carregando...</p>';
    try {
        const res = await fetch(`/api/registro-compras/auditoria/${id}`);
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Falha ao carregar detalhe');
        }
        const data = await res.json();
        renderDetalhe(data);
    } catch (e) {
        els.detalheBody.innerHTML = `<p style="color:var(--clr-danger);">${e.message}</p>`;
    }
}

function renderDetalhe(data) {
    const r = data.registro;
    const timelineHtml = data.timeline.map((ev, idx) => {
        const transicao = ev.status_anterior
            ? `${ev.status_anterior} → <strong>${ev.status_novo}</strong>`
            : `<strong>Registro criado</strong> (${ev.status_novo})`;
        const intervalo = idx > 0
            ? `<span class="auditoria-timeline__delta">+${ev.desde_anterior_texto} desde a etapa anterior</span>`
            : '';
        return `
            <li class="auditoria-timeline__item">
                <div class="auditoria-timeline__head">${transicao}</div>
                <div class="auditoria-timeline__meta">
                    ${formatarData(ev.timestamp)} · ${ev.autor || 'Sistema'}
                </div>
                ${intervalo}
            </li>
        `;
    }).join('');

    const tempoStatusHtml = data.tempo_por_status.map(t => `
        <li><span>${t.status}</span><strong>${t.texto}</strong></li>
    `).join('');

    els.detalheBody.innerHTML = `
        <div class="auditoria-detalhe__resumo">
            <div><span class="auditoria-detalhe__rotulo">Fornecedor</span><strong>${r.fornecedor}</strong></div>
            <div><span class="auditoria-detalhe__rotulo">Comprador</span><strong>${r.comprador_nome || 'Em Aberto'}</strong></div>
            <div><span class="auditoria-detalhe__rotulo">Situação atual</span><strong>${r.status}</strong></div>
            <div><span class="auditoria-detalhe__rotulo">Tempo até finalizar</span>
                <strong>${r.finalizado ? r.duracao_texto : 'Em andamento'}</strong></div>
        </div>

        <h4 class="auditoria-subtitulo">Tempo em cada situação</h4>
        <ul class="auditoria-tempo-status">${tempoStatusHtml || '<li>—</li>'}</ul>

        <h4 class="auditoria-subtitulo">Linha do tempo</h4>
        <ul class="auditoria-timeline">${timelineHtml}</ul>
    `;
}

function trocarAba(aba) {
    abaAtual = aba;
    els.tabPedidos.style.display = aba === 'pedidos' ? '' : 'none';
    els.tabMedias.style.display = aba === 'medias' ? '' : 'none';
    document.querySelectorAll('.aud-tab-btn').forEach(b => {
        b.classList.toggle('aud-tab-btn--active', b.dataset.tab === aba);
    });
}

export function initAuditoriaComprasPage() {
    els = {
        filtroComprador: document.getElementById('aud-filtro-comprador'),
        filtroFornecedor: document.getElementById('aud-filtro-fornecedor'),
        filtroDataInicio: document.getElementById('aud-filtro-data-inicio'),
        filtroDataFim: document.getElementById('aud-filtro-data-fim'),
        filtroStatus: document.getElementById('aud-filtro-status'),
        cards: document.getElementById('aud-cards'),
        tabelaBody: document.getElementById('aud-tabela-body'),
        mediasCompradorBody: document.getElementById('aud-medias-comprador-body'),
        mediasFornecedorBody: document.getElementById('aud-medias-fornecedor-body'),
        tabPedidos: document.getElementById('aud-tab-pedidos'),
        tabMedias: document.getElementById('aud-tab-medias'),
        detalheModal: document.getElementById('aud-detalhe-modal-overlay'),
        detalheBody: document.getElementById('aud-detalhe-body'),
    };
    if (!els.tabelaBody) return;

    document.getElementById('aud-btn-aplicar').addEventListener('click', carregarAuditoria);
    document.getElementById('aud-btn-atualizar').addEventListener('click', carregarAuditoria);
    document.getElementById('aud-btn-limpar').addEventListener('click', () => {
        els.filtroComprador.value = '';
        els.filtroFornecedor.value = '';
        els.filtroDataInicio.value = '';
        els.filtroDataFim.value = '';
        els.filtroStatus.value = '';
        carregarAuditoria();
    });

    document.querySelectorAll('.aud-tab-btn').forEach(b => {
        b.addEventListener('click', () => trocarAba(b.dataset.tab));
    });

    els.tabelaBody.addEventListener('click', (e) => {
        const id = e.target.dataset.detalhe;
        if (id) abrirDetalhe(id);
    });

    document.getElementById('aud-detalhe-fechar').addEventListener('click', () => {
        els.detalheModal.style.display = 'none';
    });
    els.detalheModal.addEventListener('click', (e) => {
        if (e.target === els.detalheModal) els.detalheModal.style.display = 'none';
    });

    if (AppState.socket) {
        AppState.socket.on('registro_compras_atualizado', () => {
            if (els.detalheModal.style.display !== 'flex') carregarAuditoria();
        });
    }

    carregarCompradores();
    carregarAuditoria();
}
