// static/js/pages/aprovar-ajustes-estoque.js
import { AppState } from '../state.js';
import { showToast } from '../toasts.js';
import { formatarData, showConfirmModal } from '../ui.js';

const state = {
    tabStatus: 'Ativa',
    campanhas: [],
    ajustesPorCampanha: {},       // {campanhaId: [ajustes]}
    filtroStatusPorCampanha: {},  // {campanhaId: 'Pendente'|'Ajustado'|'Cancelado'|'todos'}
    expandidas: new Set(),
    usuarios: [],
    modoEdicao: null,             // null (criar) | campanhaId (editar ajustadores)
};

function els() {
    return {
        tabs: document.getElementById('campanhas-tabs'),
        lista: document.getElementById('campanhas-lista'),
        btnNova: document.getElementById('btn-nova-campanha'),
        campModal: document.getElementById('campanha-modal-overlay'),
        campTitle: document.getElementById('campanha-modal-title'),
        campNome: document.getElementById('camp-nome'),
        campObs: document.getElementById('camp-obs'),
        campBusca: document.getElementById('camp-busca-ajustador'),
        campAjustadoresLista: document.getElementById('camp-ajustadores-lista'),
        btnSalvar: document.getElementById('btn-salvar-campanha'),
        ajusteModal: document.getElementById('ajuste-modal-overlay'),
        ajusteBody: document.getElementById('ajuste-modal-body'),
        ajusteFooter: document.getElementById('ajuste-modal-footer'),
        lightbox: document.getElementById('foto-lightbox'),
        lightboxImg: document.getElementById('foto-lightbox-img'),
    };
}

// ---------- Carregamento ----------

async function carregarCampanhas() {
    const e = els();
    e.lista.innerHTML = '<p class="empty-state">Carregando...</p>';
    try {
        const res = await fetch(`/api/estoque/campanhas?status=${state.tabStatus}`);
        if (!res.ok) throw new Error('Falha ao carregar');
        state.campanhas = await res.json();
        render();
    } catch (err) {
        e.lista.innerHTML = `<p class="empty-state">Erro: ${err.message}</p>`;
    }
}

async function carregarAjustesCampanha(campanhaId) {
    const status = state.filtroStatusPorCampanha[campanhaId] || 'Pendente';
    const qs = new URLSearchParams({ campanha_id: campanhaId, limit: 500 });
    if (status !== 'todos') qs.append('status', status);
    const res = await fetch(`/api/estoque/ajustes?${qs}`);
    if (!res.ok) throw new Error('Falha ao carregar ajustes');
    state.ajustesPorCampanha[campanhaId] = await res.json();
}

// ---------- Render ----------

function diffBadge(sistema, real) {
    if (sistema == null) return '';
    const diff = real - sistema;
    const cls = diff === 0 ? 'diff-zero' : diff > 0 ? 'diff-pos' : 'diff-neg';
    const sign = diff > 0 ? '+' : '';
    return `<span class="diff-badge ${cls}">${sign}${diff}</span>`;
}

function render() {
    const e = els();
    if (!state.campanhas.length) {
        e.lista.innerHTML = `<p class="empty-state">Nenhuma campanha ${state.tabStatus.toLowerCase()}.</p>`;
        return;
    }
    e.lista.innerHTML = state.campanhas.map(c => renderCampanhaCard(c)).join('');
    bindCampanhaEvents();
}

function renderCampanhaCard(c) {
    const s = c.stats || { Pendente: 0, Ajustado: 0, Cancelado: 0, total: 0 };
    const expandida = state.expandidas.has(c.id);
    const isAtiva = c.status === 'Ativa';
    const filtroStatus = state.filtroStatusPorCampanha[c.id] || 'Pendente';

    const ajustadoresChips = c.ajustadores.slice(0, 5).map(u =>
        `<span class="ajustador-chip">${u.nome}</span>`
    ).join('');
    const extra = c.ajustadores.length > 5 ? `<span class="ajustador-chip ajustador-chip--more">+${c.ajustadores.length - 5}</span>` : '';

    return `
        <div class="campanha-card ${expandida ? 'campanha-card--expandida' : ''}" data-id="${c.id}">
            <div class="campanha-card__header">
                <div class="campanha-card__header-main">
                    <button class="campanha-card__toggle" data-action="toggle" title="Expandir/recolher">
                        ${expandida ? '▾' : '▸'}
                    </button>
                    <div class="campanha-card__titulo">
                        <h3>${c.nome}</h3>
                        <div class="campanha-card__meta">
                            Iniciada ${formatarData(c.data_inicio)} por ${c.criado_por}
                            ${c.data_fim ? ` · Finalizada ${formatarData(c.data_fim)}` : ''}
                        </div>
                    </div>
                    <span class="campanha-status campanha-status--${isAtiva ? 'ativa' : 'finalizada'}">
                        ${c.status}
                    </span>
                </div>
                <div class="campanha-card__stats">
                    <span class="stat stat--pendente" data-action="set-filtro" data-filtro="Pendente">
                        <strong>${s.Pendente}</strong> pendentes
                    </span>
                    <span class="stat stat--ajustado" data-action="set-filtro" data-filtro="Ajustado">
                        <strong>${s.Ajustado}</strong> ajustados
                    </span>
                    <span class="stat stat--cancelado" data-action="set-filtro" data-filtro="Cancelado">
                        <strong>${s.Cancelado}</strong> cancelados
                    </span>
                    <span class="stat stat--total">${s.total} total</span>
                </div>
                <div class="campanha-card__ajustadores">
                    ${ajustadoresChips}${extra}
                </div>
                <div class="campanha-card__actions">
                    ${isAtiva ? `
                        <button class="btn btn--secondary btn--sm" data-action="editar-ajustadores">Gerenciar ajustadores</button>
                        <button class="btn btn--primary btn--sm" data-action="aprovar-todos" ${s.Pendente === 0 ? 'disabled' : ''}>
                            Aprovar todos pendentes
                        </button>
                        <button class="btn btn--danger btn--sm" data-action="finalizar">Finalizar campanha</button>
                    ` : (c.nome !== 'Legado' ? `
                        <button class="btn btn--secondary btn--sm" data-action="reabrir">Reabrir</button>
                    ` : '')}
                    ${c.nome !== 'Legado' ? `
                        <button class="btn btn--excluir btn--sm" data-action="excluir"
                            ${s.total > 0
                                ? `disabled title="Campanha com ${s.total} requisição(ões) — esvazie-a antes de excluir"`
                                : 'title="Excluir campanha permanentemente"'}>
                            🗑 Excluir
                        </button>
                    ` : ''}
                </div>
            </div>
            ${expandida ? `
                <div class="campanha-card__body">
                    <div class="campanha-card__filtros">
                        ${['Pendente', 'Ajustado', 'Cancelado'].map(st => `
                            <button class="filtro-pill ${filtroStatus === st ? 'filtro-pill--active' : ''}"
                                    data-action="set-filtro" data-filtro="${st}">
                                ${st}
                            </button>
                        `).join('')}
                    </div>
                    <div class="ajustes-list" data-list-id="${c.id}">
                        <p class="empty-state">Carregando ajustes...</p>
                    </div>
                </div>
            ` : ''}
        </div>
    `;
}

function renderListaAjustes(campanhaId) {
    const container = document.querySelector(`[data-list-id="${campanhaId}"]`);
    if (!container) return;
    const ajustes = state.ajustesPorCampanha[campanhaId] || [];
    const campanha = state.campanhas.find(c => c.id === campanhaId);
    const isAtiva = campanha && campanha.status === 'Ativa';

    if (!ajustes.length) {
        container.innerHTML = '<p class="empty-state">Nenhum ajuste neste filtro.</p>';
        return;
    }
    container.innerHTML = ajustes.map(a => {
        const sistema = a.quantidade_sistema != null ? a.quantidade_sistema : '—';
        const fotoHtml = a.foto_url
            ? `<button class="ajuste-card__foto-btn" data-foto="${a.foto_url}">Ver foto</button>`
            : '';
        const aprovBadge = a.aprovado_por
            ? `<div class="ajuste-card__aprov">Processado por <strong>${a.aprovado_por}</strong> em ${formatarData(a.data_aprovacao)}</div>`
            : '';
        return `
            <div class="ajuste-card" data-id="${a.id}">
                <div class="ajuste-card__autor">Requisitado por: ${a.criado_por}</div>
                <div class="ajuste-card__body">
                    <div class="ajuste-card__head">
                        <span class="ajuste-card__codigo">${a.codigo}</span>
                        <span class="ajuste-card__marca">${a.marca}</span>
                    </div>
                    ${a.descricao ? `<div class="ajuste-card__desc">${a.descricao}</div>` : ''}
                    <div class="ajuste-card__qtds">
                        Sistema: <strong>${sistema}</strong> → Real: <strong>${a.quantidade_real}</strong>
                        ${diffBadge(a.quantidade_sistema, a.quantidade_real)}
                    </div>
                    <div class="ajuste-card__meta">${formatarData(a.data_criacao)}</div>
                    ${aprovBadge}
                    ${a.observacao_gerente ? `<div class="ajuste-card__obs">Obs: ${a.observacao_gerente}</div>` : ''}
                </div>
                <div class="ajuste-card__actions">
                    ${fotoHtml}
                    <button class="btn btn--secondary btn-detalhes">Detalhes</button>
                    ${isAtiva && a.status === 'Pendente' ? `
                        <button class="btn btn--primary btn-aprovar">Marcar como Ajustado</button>
                        <button class="btn btn--danger btn-cancelar">Cancelar</button>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');

    container.querySelectorAll('.ajuste-card').forEach(card => {
        const id = parseInt(card.dataset.id);
        const ajuste = ajustes.find(a => a.id === id);
        card.querySelector('.btn-aprovar')?.addEventListener('click', () => aprovar(ajuste));
        card.querySelector('.btn-cancelar')?.addEventListener('click', () => cancelar(ajuste));
        card.querySelector('.btn-detalhes')?.addEventListener('click', () => abrirDetalhes(ajuste));
        card.querySelector('.ajuste-card__foto-btn')?.addEventListener('click', (ev) => {
            abrirLightbox(ev.currentTarget.dataset.foto);
        });
    });
}

// ---------- Eventos dos cards ----------

function bindCampanhaEvents() {
    const e = els();
    e.lista.querySelectorAll('.campanha-card').forEach(card => {
        const id = parseInt(card.dataset.id);
        card.querySelectorAll('[data-action]').forEach(el => {
            el.addEventListener('click', (ev) => {
                ev.stopPropagation();
                const action = el.dataset.action;
                const filtro = el.dataset.filtro;
                handleCampanhaAction(id, action, filtro);
            });
        });
    });
    // Auto-carrega ajustes das campanhas ja expandidas
    state.expandidas.forEach(id => {
        if (state.campanhas.find(c => c.id === id)) {
            carregarAjustesCampanha(id).then(() => renderListaAjustes(id));
        }
    });
}

async function handleCampanhaAction(campanhaId, action, filtro) {
    if (action === 'toggle') {
        if (state.expandidas.has(campanhaId)) {
            state.expandidas.delete(campanhaId);
        } else {
            state.expandidas.add(campanhaId);
            if (!state.filtroStatusPorCampanha[campanhaId]) {
                state.filtroStatusPorCampanha[campanhaId] = 'Pendente';
            }
        }
        render();
        return;
    }
    if (action === 'set-filtro') {
        state.filtroStatusPorCampanha[campanhaId] = filtro;
        state.expandidas.add(campanhaId);
        render();
        return;
    }
    if (action === 'finalizar') return finalizarCampanha(campanhaId);
    if (action === 'reabrir') return reabrirCampanha(campanhaId);
    if (action === 'editar-ajustadores') return abrirModalEdicao(campanhaId);
    if (action === 'aprovar-todos') return aprovarTodosPendentes(campanhaId);
    if (action === 'excluir') return excluirCampanha(campanhaId);
}

// ---------- Ações em ajustes ----------

async function aprovar(a) {
    const observacao = prompt(`Marcar ajuste ${a.codigo}/${a.marca} como AJUSTADO. Observação (opcional):`);
    if (observacao === null) return;
    try {
        const res = await fetch(`/api/estoque/ajustes/${a.id}/aprovar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ observacao }),
        });
        if (!res.ok) throw new Error((await res.json()).error || 'Erro');
        showToast('Ajuste processado.', 'success');
        await recarregar();
    } catch (e) {
        showToast(e.message, 'error');
    }
}

async function cancelar(a) {
    showConfirmModal(`Cancelar requisição ${a.codigo}/${a.marca}?`, async () => {
        try {
            const res = await fetch(`/api/estoque/ajustes/${a.id}/cancelar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
            if (!res.ok) throw new Error((await res.json()).error || 'Erro');
            showToast('Requisição cancelada.', 'success');
            await recarregar();
        } catch (e) {
            showToast(e.message, 'error');
        }
    });
}

async function aprovarTodosPendentes(campanhaId) {
    const campanha = state.campanhas.find(c => c.id === campanhaId);
    const pendentes = campanha?.stats?.Pendente || 0;
    if (!pendentes) return;
    showConfirmModal(`Marcar os ${pendentes} ajustes pendentes da campanha "${campanha.nome}" como AJUSTADOS?`, async () => {
        // Busca pendentes para iterar
        const qs = new URLSearchParams({ campanha_id: campanhaId, status: 'Pendente', limit: 500 });
        const res = await fetch(`/api/estoque/ajustes?${qs}`);
        const lista = await res.json();
        let ok = 0, erro = 0;
        for (const a of lista) {
            try {
                const r = await fetch(`/api/estoque/ajustes/${a.id}/aprovar`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ observacao: 'Aprovação em lote' }),
                });
                if (r.ok) ok++; else erro++;
            } catch (e) { erro++; }
        }
        showToast(`Aprovados: ${ok}${erro ? ` · Erros: ${erro}` : ''}`, erro ? 'error' : 'success');
        await recarregar();
    });
}

async function finalizarCampanha(campanhaId) {
    const campanha = state.campanhas.find(c => c.id === campanhaId);
    const pendentes = campanha?.stats?.Pendente || 0;
    const msg = pendentes
        ? `Há ${pendentes} ajustes pendentes nesta campanha. Finalizar mesmo assim? Ajustes pendentes ficarão travados.`
        : `Finalizar a campanha "${campanha.nome}"? Novas requisições serão bloqueadas.`;
    showConfirmModal(msg, async () => {
        try {
            const res = await fetch(`/api/estoque/campanhas/${campanhaId}/finalizar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ forcar: pendentes > 0 }),
            });
            if (!res.ok) throw new Error((await res.json()).error || 'Erro');
            showToast('Campanha finalizada.', 'success');
            await carregarCampanhas();
        } catch (e) {
            showToast(e.message, 'error');
        }
    });
}

async function reabrirCampanha(campanhaId) {
    showConfirmModal('Reabrir campanha? Novas requisições poderão ser feitas.', async () => {
        try {
            const res = await fetch(`/api/estoque/campanhas/${campanhaId}/reabrir`, { method: 'POST' });
            if (!res.ok) throw new Error((await res.json()).error || 'Erro');
            showToast('Campanha reaberta.', 'success');
            await carregarCampanhas();
        } catch (e) {
            showToast(e.message, 'error');
        }
    });
}

async function excluirCampanha(campanhaId) {
    const campanha = state.campanhas.find(c => c.id === campanhaId);
    const totalAjustes = campanha?.stats?.total ?? 0;

    // Guarda client-side: botão já está desabilitado, mas por segurança
    if (totalAjustes > 0) {
        showToast(
            `Esta campanha possui ${totalAjustes} requisição(ões) vinculada(s) e não pode ser excluída.`,
            'error'
        );
        return;
    }

    showConfirmModal(
        `Excluir permanentemente a campanha "${campanha?.nome}"?\n\nEsta ação não pode ser desfeita.`,
        async () => {
            try {
                const res = await fetch(`/api/estoque/campanhas/${campanhaId}`, {
                    method: 'DELETE',
                });
                if (!res.ok) {
                    const body = await res.json().catch(() => ({}));
                    throw new Error(body.error || 'Erro ao excluir campanha');
                }
                showToast('Campanha excluída com sucesso.', 'success');
                // Remove do estado local para evitar re-render com dado obsoleto
                state.campanhas = state.campanhas.filter(c => c.id !== campanhaId);
                state.expandidas.delete(campanhaId);
                delete state.ajustesPorCampanha[campanhaId];
                delete state.filtroStatusPorCampanha[campanhaId];
                render();
            } catch (e) {
                showToast(e.message, 'error');
            }
        }
    );
}

// ---------- Modal Campanha (criar/editar) ----------

async function carregarUsuarios() {
    if (state.usuarios.length) return;
    try {
        const res = await fetch('/api/usuarios');
        if (res.ok) state.usuarios = await res.json();
    } catch (e) {
        showToast('Erro ao carregar usuários', 'error');
    }
}

async function abrirModalNovaCampanha() {
    await carregarUsuarios();
    const e = els();
    state.modoEdicao = null;
    e.campTitle.textContent = 'Nova Campanha';
    e.campNome.value = '';
    e.campObs.value = '';
    e.campBusca.value = '';
    renderListaAjustadores(new Set());
    e.campModal.style.display = 'flex';
    setTimeout(() => e.campNome.focus(), 100);
}

async function abrirModalEdicao(campanhaId) {
    await carregarUsuarios();
    const e = els();
    const campanha = state.campanhas.find(c => c.id === campanhaId);
    state.modoEdicao = campanhaId;
    e.campTitle.textContent = `Gerenciar ajustadores — ${campanha.nome}`;
    e.campNome.value = campanha.nome;
    e.campNome.disabled = true;
    e.campObs.value = campanha.observacao || '';
    e.campObs.disabled = true;
    e.campBusca.value = '';
    const selecionados = new Set(campanha.ajustadores.map(u => u.id));
    renderListaAjustadores(selecionados);
    e.campModal.style.display = 'flex';
}

function renderListaAjustadores(selecionados, filtro = '') {
    const e = els();
    const filtroLow = filtro.trim().toLowerCase();
    const lista = state.usuarios
        .filter(u => u.role === 'Ajuste')
        .filter(u => !filtroLow || (u.nome || '').toLowerCase().includes(filtroLow) || (u.email || '').toLowerCase().includes(filtroLow))
        .sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));

    if (!lista.length) {
        e.campAjustadoresLista.innerHTML = '<p class="empty-state" style="padding:1rem;">Nenhum usuário com role "Ajuste" encontrado.</p>';
        return;
    }

    e.campAjustadoresLista.innerHTML = lista.map(u => `
        <label class="ajustador-opt">
            <input type="checkbox" value="${u.uid}" ${selecionados.has(u.uid) ? 'checked' : ''}>
            <span class="ajustador-opt__nome">${u.nome || u.email}</span>
            <span class="ajustador-opt__role">${u.role || ''}</span>
        </label>
    `).join('');
}

function coletarAjustadoresSelecionados() {
    return Array.from(
        document.querySelectorAll('#camp-ajustadores-lista input[type="checkbox"]:checked')
    ).map(el => el.value);
}

async function salvarCampanha() {
    const e = els();
    const ajustadoresIds = coletarAjustadoresSelecionados();
    if (!ajustadoresIds.length) {
        showToast('Selecione ao menos um ajustador.', 'error');
        return;
    }

    e.btnSalvar.disabled = true;
    try {
        let res;
        if (state.modoEdicao) {
            res = await fetch(`/api/estoque/campanhas/${state.modoEdicao}/ajustadores`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ajustadores_ids: ajustadoresIds }),
            });
        } else {
            const nome = e.campNome.value.trim();
            if (!nome) {
                showToast('Informe o nome da campanha.', 'error');
                e.btnSalvar.disabled = false;
                return;
            }
            res = await fetch('/api/estoque/campanhas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    nome,
                    observacao: e.campObs.value.trim() || null,
                    ajustadores_ids: ajustadoresIds,
                }),
            });
        }
        if (!res.ok) throw new Error((await res.json()).error || 'Erro');
        showToast(state.modoEdicao ? 'Ajustadores atualizados.' : 'Campanha criada!', 'success');
        e.campModal.style.display = 'none';
        e.campNome.disabled = false;
        e.campObs.disabled = false;
        await carregarCampanhas();
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        e.btnSalvar.disabled = false;
    }
}

// ---------- Modal detalhes ajuste ----------

function abrirLightbox(url) {
    const e = els();
    e.lightboxImg.src = url;
    e.lightbox.style.display = 'flex';
}

function abrirDetalhes(a) {
    const e = els();
    const sistema = a.quantidade_sistema != null ? a.quantidade_sistema : '—';
    e.ajusteBody.innerHTML = `
        <div class="ajuste-card__autor" style="margin-bottom:1rem;">Requisitado por: ${a.criado_por}</div>
        <p><strong>Código:</strong> ${a.codigo}</p>
        <p><strong>Marca:</strong> ${a.marca}</p>
        ${a.descricao ? `<p><strong>Descrição:</strong> ${a.descricao}</p>` : ''}
        <p><strong>Quantidade sistema:</strong> ${sistema}</p>
        <p><strong>Quantidade real:</strong> ${a.quantidade_real} ${diffBadge(a.quantidade_sistema, a.quantidade_real)}</p>
        <p><strong>Data:</strong> ${formatarData(a.data_criacao)}</p>
        ${a.aprovado_por ? `<p><strong>Processado por:</strong> ${a.aprovado_por} em ${formatarData(a.data_aprovacao)}</p>` : ''}
        ${a.observacao_gerente ? `<p><strong>Observação:</strong> ${a.observacao_gerente}</p>` : ''}
        ${a.foto_url ? `<img src="${a.foto_url}" class="detalhe-foto" alt="Foto">` : ''}
    `;
    e.ajusteFooter.innerHTML = '<button class="btn btn--secondary close-modal">Fechar</button>';
    e.ajusteFooter.querySelector('.close-modal').onclick = () => (e.ajusteModal.style.display = 'none');
    e.ajusteModal.style.display = 'flex';
}

// ---------- Util ----------

async function recarregar() {
    await carregarCampanhas();
    for (const id of state.expandidas) {
        if (state.campanhas.find(c => c.id === id)) {
            await carregarAjustesCampanha(id);
            renderListaAjustes(id);
        }
    }
}

// ---------- Init ----------

export function initAprovarAjustesEstoquePage() {
    const e = els();
    if (!e.tabs) return;

    e.tabs.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            e.tabs.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.tabStatus = btn.dataset.status;
            state.expandidas.clear();
            carregarCampanhas();
        });
    });

    e.btnNova.addEventListener('click', abrirModalNovaCampanha);
    e.btnSalvar.addEventListener('click', salvarCampanha);

    e.campBusca.addEventListener('input', () => {
        const selecionados = new Set(coletarAjustadoresSelecionados());
        renderListaAjustadores(selecionados, e.campBusca.value);
    });

    e.campModal.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            e.campModal.style.display = 'none';
            e.campNome.disabled = false;
            e.campObs.disabled = false;
        });
    });

    e.lightbox.addEventListener('click', () => {
        e.lightbox.style.display = 'none';
        e.lightboxImg.src = '';
    });

    if (AppState.socket) {
        AppState.socket.off('novo_ajuste_estoque');
        AppState.socket.off('ajuste_estoque_atualizado');
        AppState.socket.off('campanha_ajuste_criada');
        AppState.socket.off('campanha_ajuste_atualizada');
        AppState.socket.off('campanha_ajuste_excluida');
        const recarregarTudo = () => recarregar();
        AppState.socket.on('novo_ajuste_estoque', recarregarTudo);
        AppState.socket.on('ajuste_estoque_atualizado', recarregarTudo);
        AppState.socket.on('campanha_ajuste_criada', () => carregarCampanhas());
        AppState.socket.on('campanha_ajuste_atualizada', () => carregarCampanhas());
        // Outro cliente excluiu uma campanha — recarregar lista
        AppState.socket.on('campanha_ajuste_excluida', () => carregarCampanhas());
    }

    carregarCampanhas();
}
