// static/js/pages/separacoes-canceladas.js
import { AppState } from '../state.js';
import { showToast } from '../toasts.js';
import { showConfirmModal } from '../ui.js';
import { attachAutocomplete } from '../autocomplete.js';

const LIMIT = 30;

let el = {};
let separadores = [];
let clientesCache = [];
let registros = [];
let page = 0;
let temMais = false;
let carregando = false;
let busca = '';
let editandoId = null;       // id da linha em edição inline
let debounce = null;

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// 'YYYY-MM-DD' -> 'DD/MM/YYYY'
function formatarDataBR(data) {
    if (!data) return '—';
    const partes = String(data).slice(0, 10).split('-');
    if (partes.length !== 3) return data;
    return `${partes[2]}/${partes[1]}/${partes[0]}`;
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

function opcoesSeparador(selecionado) {
    return separadores.map(n =>
        `<option value="${escapeHtml(n)}" ${n === selecionado ? 'selected' : ''}>${escapeHtml(n)}</option>`
    ).join('');
}

// ---------------------------------------------------------------------------
// Render da tabela
// ---------------------------------------------------------------------------
function linhaHtml(r) {
    return `
        <td>${formatarDataBR(r.data)}</td>
        <td>${escapeHtml(r.numero_separacao)}</td>
        <td>${escapeHtml(r.nome_cliente)}</td>
        <td>${escapeHtml(r.separador_nome)}</td>
        <td>
            <button class="btn btn--secondary btn--sm" data-acao="editar">✎</button>
            <button class="btn btn--danger btn--sm" data-acao="excluir">×</button>
        </td>`;
}

function linhaEdicaoHtml(r) {
    return `
        <td><input type="date" class="edit-data" value="${escapeHtml(r.data)}"></td>
        <td><input type="text" class="edit-numero" value="${escapeHtml(r.numero_separacao)}" style="width:100px;"></td>
        <td><input type="text" class="edit-cliente" list="lista-clientes" value="${escapeHtml(r.nome_cliente)}"></td>
        <td><select class="edit-separador">${opcoesSeparador(r.separador_nome)}</select></td>
        <td>
            <button class="btn btn--primary btn--sm" data-acao="salvar">Salvar</button>
            <button class="btn btn--secondary btn--sm" data-acao="cancelar">Cancelar</button>
        </td>`;
}

function montarLinha(r) {
    const tr = document.createElement('tr');
    tr.dataset.id = r.id;
    tr.innerHTML = (editandoId === r.id) ? linhaEdicaoHtml(r) : linhaHtml(r);
    return tr;
}

function renderTabela() {
    el.tbody.innerHTML = '';
    registros.forEach(r => el.tbody.appendChild(montarLinha(r)));
    el.tabela.style.display = registros.length ? 'table' : 'none';
    // Liga o autocomplete ao input de cliente da linha em edição (se houver).
    const editCliente = el.tbody.querySelector('.edit-cliente');
    if (editCliente) attachAutocomplete(editCliente, () => clientesCache);
}

// ---------------------------------------------------------------------------
// Carregamento
// ---------------------------------------------------------------------------
async function carregar(reset = false) {
    if (carregando) return;
    carregando = true;
    if (reset) { page = 0; registros = []; }
    el.spinnerMais.style.display = 'block';
    try {
        const data = await api('/api/separacoes-canceladas/paginadas', {
            method: 'POST',
            body: JSON.stringify({ page, limit: LIMIT, search: busca }),
        });
        registros = registros.concat(data.registros || []);
        temMais = !!data.temMais;
        page += 1;
        renderTabela();
    } catch (e) {
        showToast('Não foi possível carregar os registros.', 'error');
    } finally {
        carregando = false;
        el.spinner.style.display = 'none';
        el.spinnerMais.style.display = 'none';
    }
}

async function carregarClientes() {
    try {
        clientesCache = await api('/api/separacoes/clientes-nomes');
    } catch (e) { /* autocomplete é opcional */ }
}

// ---------------------------------------------------------------------------
// Ações
// ---------------------------------------------------------------------------
async function criar(e) {
    e.preventDefault();
    const body = {
        data: el.data.value,
        numero_separacao: el.numero.value.trim(),
        nome_cliente: el.cliente.value.trim(),
        separador_nome: el.separador.value,
        editor_nome: AppState.currentUser?.nome || 'Sistema',
    };
    if (!body.data || !body.numero_separacao || !body.nome_cliente || !body.separador_nome) {
        return showToast('Preencha todos os campos.', 'error');
    }
    try {
        await api('/api/separacoes-canceladas', { method: 'POST', body: JSON.stringify(body) });
        showToast('Lançamento registrado!', 'success');
        el.numero.value = '';
        el.cliente.value = '';
        carregar(true);
        carregarClientes();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function salvarEdicao(tr) {
    const id = Number(tr.dataset.id);
    const body = {
        data: tr.querySelector('.edit-data').value,
        numero_separacao: tr.querySelector('.edit-numero').value.trim(),
        nome_cliente: tr.querySelector('.edit-cliente').value.trim(),
        separador_nome: tr.querySelector('.edit-separador').value,
        editor_nome: AppState.currentUser?.nome || 'Sistema',
    };
    try {
        const resp = await api(`/api/separacoes-canceladas/${id}`, {
            method: 'PUT', body: JSON.stringify(body),
        });
        const idx = registros.findIndex(r => r.id === id);
        if (idx >= 0) registros[idx] = resp.registro;
        editandoId = null;
        renderTabela();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function excluir(id) {
    showConfirmModal('Excluir este lançamento?', async () => {
        try {
            await api(`/api/separacoes-canceladas/${id}`, {
                method: 'DELETE',
                body: JSON.stringify({ editor_nome: AppState.currentUser?.nome || 'Sistema' }),
            });
            registros = registros.filter(r => r.id !== id);
            renderTabela();
            showToast('Lançamento excluído.', 'success');
        } catch (err) {
            showToast(err.message, 'error');
        }
    });
}

function onTabelaClick(e) {
    const btn = e.target.closest('button[data-acao]');
    if (!btn) return;
    const tr = btn.closest('tr');
    const id = Number(tr.dataset.id);
    const acao = btn.dataset.acao;

    if (acao === 'editar') { editandoId = id; renderTabela(); }
    else if (acao === 'cancelar') { editandoId = null; renderTabela(); }
    else if (acao === 'salvar') { salvarEdicao(tr); }
    else if (acao === 'excluir') { excluir(id); }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
export async function initSeparacoesCanceladasPage() {
    el = {
        form: document.getElementById('form-cancelada'),
        data: document.getElementById('cancelada-data'),
        numero: document.getElementById('cancelada-numero'),
        cliente: document.getElementById('cancelada-cliente'),
        separador: document.getElementById('cancelada-separador'),
        filtro: document.getElementById('filtro-canceladas'),
        tabela: document.getElementById('tabela-canceladas'),
        tbody: document.getElementById('tabela-canceladas-body'),
        spinner: document.getElementById('loading-spinner-canceladas'),
        spinnerMais: document.getElementById('loading-more-spinner-canceladas'),
    };
    if (!el.form) return;

    // Data padrão = hoje
    el.data.value = new Date().toISOString().slice(0, 10);

    // Carrega lista global de separadores
    try {
        const nomes = await api('/api/usuarios/separador-nomes');
        separadores = (nomes || []).filter(n => n.toLowerCase() !== 'separacao');
        el.separador.innerHTML =
            '<option value="" disabled selected>Separador</option>' + opcoesSeparador(null);
    } catch (e) {
        showToast('Erro ao carregar separadores.', 'error');
    }

    el.form.addEventListener('submit', criar);
    el.tbody.addEventListener('click', onTabelaClick);
    attachAutocomplete(el.cliente, () => clientesCache);

    el.filtro.addEventListener('input', (e) => {
        busca = e.target.value;
        clearTimeout(debounce);
        debounce = setTimeout(() => carregar(true), 400);
    });

    // Scroll infinito
    window.addEventListener('scroll', () => {
        if (carregando || !temMais) return;
        if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 300) {
            carregar();
        }
    });

    if (AppState.socket) {
        AppState.socket.on('separacao_cancelada_atualizada', () => carregar(true));
    }

    carregarClientes();
    await carregar(true);
}
