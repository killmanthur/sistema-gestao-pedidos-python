// static/js/pages/gerenciar-clientes.js
import { AppState } from '../state.js';
import { showToast } from '../toasts.js';
import { showConfirmModal } from '../ui.js';

const LIMIT = 30;

let el = {};
let clientes = [];
let page = 0;
let temMais = false;
let carregando = false;
let busca = '';
let soOcultos = false;   // filtro "mostrar só ocultos"
let editando = null;     // nome em edição inline
let debounce = null;
let selecionados = new Set();   // nomes marcados p/ mesclar

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

const autor = () => AppState.currentUser?.nome || 'Sistema';

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
function montarLinha(c) {
    const tr = document.createElement('tr');
    tr.dataset.nome = c.nome;

    if (editando === c.nome) {
        tr.innerHTML = `
            <td></td>
            <td><input type="text" class="edit-nome" value="${escapeHtml(c.nome)}" style="width:100%;"></td>
            <td>${c.usos}</td>
            <td>
                <div class="row-acoes">
                    <button class="btn btn--primary btn--sm" data-acao="salvar">Salvar</button>
                    <button class="btn btn--secondary btn--sm" data-acao="cancelar">Cancelar</button>
                </div>
            </td>`;
        return tr;
    }

    if (c.oculto) tr.classList.add('cliente-oculto');
    const badge = c.oculto ? '<span class="badge-oculto">Oculto</span>' : '';
    const acaoVisibilidade = c.oculto
        ? `<button class="btn btn--primary btn--sm" data-acao="restaurar" title="Voltar a sugerir">↺ Restaurar</button>`
        : `<button class="btn btn--danger btn--sm" data-acao="ocultar" title="Ocultar das sugestões">× Ocultar</button>`;
    const marcado = selecionados.has(c.nome) ? 'checked' : '';

    tr.innerHTML = `
        <td style="text-align:center;"><input type="checkbox" class="sel-cliente" ${marcado}></td>
        <td><span class="cliente-nome">${escapeHtml(c.nome)}</span>${badge}</td>
        <td>${c.usos}</td>
        <td>
            <div class="row-acoes">
                <button class="btn btn--secondary btn--sm" data-acao="editar">✎ Renomear</button>
                ${acaoVisibilidade}
            </div>
        </td>`;
    return tr;
}

function renderTabela() {
    el.tbody.innerHTML = '';
    clientes.forEach(c => el.tbody.appendChild(montarLinha(c)));
    el.tabela.style.display = clientes.length ? 'table' : 'none';
    const input = el.tbody.querySelector('.edit-nome');
    if (input) { input.focus(); input.select(); }
    if (el.mergeBar) atualizarBarraMerge();
}

function atualizarCliente(nome, patch) {
    const c = clientes.find(x => x.nome === nome);
    if (c) Object.assign(c, patch);
    // No modo "só ocultos", um restaurado deixa de pertencer à lista.
    if (soOcultos) clientes = clientes.filter(x => x.oculto);
    renderTabela();
}

// ---------------------------------------------------------------------------
// Carregamento
// ---------------------------------------------------------------------------
async function carregar(reset = false) {
    if (carregando) return;
    carregando = true;
    if (reset) { page = 0; clientes = []; editando = null; }
    el.spinnerMais.style.display = 'block';
    try {
        const data = await api('/api/clientes/paginadas', {
            method: 'POST',
            body: JSON.stringify({ page, limit: LIMIT, search: busca, apenas_ocultos: soOcultos }),
        });
        clientes = clientes.concat(data.clientes || []);
        temMais = !!data.temMais;
        page += 1;
        renderTabela();
    } catch (e) {
        showToast('Não foi possível carregar os clientes.', 'error');
    } finally {
        carregando = false;
        el.spinner.style.display = 'none';
        el.spinnerMais.style.display = 'none';
    }
}

// ---------------------------------------------------------------------------
// Ações
// ---------------------------------------------------------------------------
async function salvarRenome(tr) {
    const de = tr.dataset.nome;
    const para = tr.querySelector('.edit-nome').value.trim();
    if (!para) return showToast('Informe o novo nome.', 'error');
    if (para === de) { editando = null; return renderTabela(); }
    try {
        const r = await api('/api/clientes/renomear', {
            method: 'PUT',
            body: JSON.stringify({ de, para, editor_nome: autor() }),
        });
        showToast(`Renomeado em ${r.registros} registro(s).`, 'success');
        carregar(true);
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function ocultar(nome) {
    showConfirmModal(
        `Ocultar "${nome}" das sugestões? As separações que usam esse nome continuam intactas.`,
        async () => {
            try {
                await api('/api/clientes/ocultar', {
                    method: 'POST',
                    body: JSON.stringify({ nome, editor_nome: autor() }),
                });
                atualizarCliente(nome, { oculto: true });
                showToast('Cliente ocultado.', 'success');
            } catch (err) {
                showToast(err.message, 'error');
            }
        }
    );
}

async function restaurar(nome) {
    try {
        await api('/api/clientes/restaurar', {
            method: 'POST',
            body: JSON.stringify({ nome, editor_nome: autor() }),
        });
        atualizarCliente(nome, { oculto: false });
        showToast('Cliente restaurado.', 'success');
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function onTabelaClick(e) {
    const btn = e.target.closest('button[data-acao]');
    if (!btn) return;
    const tr = btn.closest('tr');
    const nome = tr.dataset.nome;
    const acao = btn.dataset.acao;
    if (acao === 'editar') { editando = nome; renderTabela(); }
    else if (acao === 'cancelar') { editando = null; renderTabela(); }
    else if (acao === 'salvar') { salvarRenome(tr); }
    else if (acao === 'ocultar') { ocultar(nome); }
    else if (acao === 'restaurar') { restaurar(nome); }
}

// ---------------------------------------------------------------------------
// Seleção / mesclagem
// ---------------------------------------------------------------------------
function atualizarBarraMerge() {
    const n = selecionados.size;
    el.mergeCount.textContent = `${n} selecionado${n === 1 ? '' : 's'}`;
    el.mergeBar.style.display = n >= 2 ? 'flex' : 'none';
}

function onCheckChange(e) {
    if (!e.target.classList.contains('sel-cliente')) return;
    const nome = e.target.closest('tr').dataset.nome;
    if (e.target.checked) selecionados.add(nome);
    else selecionados.delete(nome);
    atualizarBarraMerge();
}

function limparSelecao() {
    selecionados.clear();
    atualizarBarraMerge();
    el.tbody.querySelectorAll('.sel-cliente:checked').forEach(c => { c.checked = false; });
}

function abrirMerge() {
    const nomes = [...selecionados];
    if (nomes.length < 2) return;
    // Ordena por nº de usos (desc) p/ sugerir o mais usado como nome correto.
    const usosDe = nome => (clientes.find(c => c.nome === nome)?.usos ?? 0);
    nomes.sort((a, b) => usosDe(b) - usosDe(a));

    el.mergeOptions.innerHTML = nomes.map((nome, i) => `
        <label class="merge-option">
            <input type="radio" name="merge-target" value="${escapeHtml(nome)}" ${i === 0 ? 'checked' : ''}>
            <span>${escapeHtml(nome)}</span>
            <small>${usosDe(nome)} sep.</small>
        </label>`).join('');
    el.mergeNovo.value = '';
    el.mergeOverlay.style.display = 'flex';
}

async function confirmarMerge() {
    const nomes = [...selecionados];
    const radio = el.mergeOptions.querySelector('input[name="merge-target"]:checked');
    const para = el.mergeNovo.value.trim() || (radio ? radio.value : '');
    if (!para) return showToast('Escolha ou digite o nome correto.', 'error');
    try {
        const r = await api('/api/clientes/mesclar', {
            method: 'PUT',
            body: JSON.stringify({ nomes, para, editor_nome: autor() }),
        });
        el.mergeOverlay.style.display = 'none';
        selecionados.clear();
        atualizarBarraMerge();
        showToast(`${nomes.length} nomes unificados (${r.registros} separações).`, 'success');
        carregar(true);
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
export function initGerenciarClientesPage() {
    el = {
        filtro: document.getElementById('filtro-clientes'),
        tabela: document.getElementById('tabela-clientes'),
        tbody: document.getElementById('tabela-clientes-body'),
        scroll: document.getElementById('clientes-scroll'),
        spinner: document.getElementById('loading-spinner-clientes'),
        spinnerMais: document.getElementById('loading-more-spinner-clientes'),
        btnOcultos: document.getElementById('btn-ver-ocultos'),
        mergeBar: document.getElementById('merge-bar'),
        mergeCount: document.getElementById('merge-count'),
        btnMesclar: document.getElementById('btn-mesclar'),
        btnLimparSel: document.getElementById('btn-limpar-sel'),
        mergeOverlay: document.getElementById('merge-modal-overlay'),
        mergeOptions: document.getElementById('merge-options'),
        mergeNovo: document.getElementById('merge-novo'),
        btnConfirmarMerge: document.getElementById('btn-confirmar-merge'),
    };
    if (!el.tbody) return;

    el.tbody.addEventListener('click', onTabelaClick);
    el.tbody.addEventListener('change', onCheckChange);
    el.tbody.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.classList.contains('edit-nome')) {
            e.preventDefault();
            salvarRenome(e.target.closest('tr'));
        } else if (e.key === 'Escape' && e.target.classList.contains('edit-nome')) {
            editando = null; renderTabela();
        }
    });

    el.filtro.addEventListener('input', (e) => {
        busca = e.target.value;
        limparSelecao();   // evita mesclar nomes que saíram da busca
        clearTimeout(debounce);
        debounce = setTimeout(() => carregar(true), 400);
    });

    // Mesclagem
    el.btnLimparSel.addEventListener('click', limparSelecao);
    el.btnMesclar.addEventListener('click', abrirMerge);
    el.btnConfirmarMerge.addEventListener('click', confirmarMerge);
    el.mergeOverlay.addEventListener('click', (e) => {
        if (e.target === el.mergeOverlay || e.target.closest('.close-modal')) {
            el.mergeOverlay.style.display = 'none';
        }
    });

    el.btnOcultos.addEventListener('click', () => {
        soOcultos = !soOcultos;
        el.btnOcultos.textContent = soOcultos ? 'Mostrar todos' : 'Mostrar só ocultos';
        el.btnOcultos.classList.toggle('btn--primary', soOcultos);
        el.btnOcultos.classList.toggle('btn--secondary', !soOcultos);
        carregar(true);
    });

    // Scroll infinito dentro do container da tabela
    el.scroll.addEventListener('scroll', () => {
        if (carregando || !temMais) return;
        if (el.scroll.scrollTop + el.scroll.clientHeight >= el.scroll.scrollHeight - 200) {
            carregar();
        }
    });

    if (AppState.socket) {
        AppState.socket.on('clientes_atualizado', () => carregar(true));
    }

    carregar(true);
}
