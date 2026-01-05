// static/js/pages/registro_compras.js
import { AppState } from '../state.js';
import { showToast } from '../toasts.js';
import { toggleButtonLoading, formatarData, showConfirmModal } from '../ui.js';

let elementos = {};
let todosRegistros = [];
let refreshInterval = null;

const STATUS_COLORS = {
    'Aguardando': 'bg-status-awaiting',
    'Em Cotação': 'bg-status-progress',
    'Pedido Efetuado': 'bg-status-success'
};

async function carregarCompradores() {
    try {
        const response = await fetch('/api/usuarios/comprador-nomes');
        const compradores = await response.json();
        const optionsHtml = '<option value="">-- Em Aberto --</option>' +
            compradores.map(n => `<option value="${n}">${n}</option>`).join('');

        document.getElementById('reg-comprador').innerHTML = optionsHtml;
        document.getElementById('edit-reg-comprador').innerHTML = optionsHtml;
        document.getElementById('filtro-comprador').innerHTML = '<option value="">Todos os Compradores</option>' + optionsHtml;
    } catch (error) { console.error(error); }
}

async function carregarTabela() {
    try {
        const response = await fetch('/api/registro-compras');
        todosRegistros = await response.json();
        aplicarFiltros();
    } catch (error) { console.error(error); }
}

function renderizarLinhas(lista) {
    elementos.tabelaBody.innerHTML = '';
    if (lista.length === 0) {
        elementos.tabelaBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 2rem;">Nenhum registro encontrado.</td></tr>';
        return;
    }

    lista.forEach(reg => {
        const tr = document.createElement('tr');
        if (reg.status === 'Aguardando') tr.classList.add('status-aguardando');
        else if (reg.status === 'Em Cotação') tr.classList.add('status-em-cotacao');
        else if (reg.status === 'Pedido Efetuado') tr.classList.add('status-pedido-efetuado');

        tr.innerHTML = `
            <td>${formatarData(reg.data_criacao)}</td>
            <td><strong>${reg.fornecedor}</strong></td>
            <td>${reg.comprador_nome ? reg.comprador_nome : '<span style="color:var(--clr-danger); font-weight:bold;">[ EM ABERTO ]</span>'}</td>
            <td><span class="badge-status ${STATUS_COLORS[reg.status]}">${reg.status}</span></td>
            <td style="font-size: 0.85rem;">${reg.observacao || '-'}</td>
            <td class="actions-cell">
                <button class="btn-action btn-edit" data-id="${reg.id}">Editar</button>
                <button class="btn-action btn-delete" data-id="${reg.id}">Excluir</button>
            </td>
        `;
        elementos.tabelaBody.appendChild(tr);
    });
}

function aplicarFiltros() {
    const forn = document.getElementById('filtro-fornecedor').value.toLowerCase();
    const comp = document.getElementById('filtro-comprador').value;
    const stat = document.getElementById('filtro-status').value;
    const dIni = document.getElementById('filtro-data-inicio').value;
    const dFim = document.getElementById('filtro-data-fim').value;

    const filtrados = todosRegistros.filter(reg => {
        const mForn = reg.fornecedor.toLowerCase().includes(forn);
        const mComp = comp === "" || reg.comprador_nome === comp;
        const mStat = stat === "" || reg.status === stat;
        const mData = (!dIni || reg.data_criacao >= dIni) && (!dFim || reg.data_criacao <= dFim + 'T23:59:59');
        return mForn && mComp && mStat && mData;
    });
    renderizarLinhas(filtrados);
}

async function gerarRelatorio() {
    showToast("Gerando relatório analítico...", "info");
    const filtros = {
        fornecedor: document.getElementById('filtro-fornecedor').value,
        comprador: document.getElementById('filtro-comprador').value,
        status: document.getElementById('filtro-status').value,
        dataInicio: document.getElementById('filtro-data-inicio').value,
        dataFim: document.getElementById('filtro-data-fim').value
    };

    try {
        const res = await fetch('/api/registro-compras/relatorio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(filtros)
        });
        const data = await res.json();
        elementos.relatorioOutput.textContent = data.relatorio;
        elementos.relatorioContainer.style.display = 'block';
        elementos.relatorioContainer.scrollIntoView({ behavior: 'smooth' });
    } catch (e) { showToast("Erro no relatório", "error"); }
}

export function initRegistroComprasPage() {
    elementos = {
        btnBusca: document.getElementById('btn-abrir-modal-busca'),
        btnCriar: document.getElementById('btn-abrir-modal-criacao'),
        btnRelatorio: document.getElementById('btn-gerar-relatorio'),
        modalBusca: document.getElementById('search-registro-modal-overlay'),
        modalCriar: document.getElementById('create-registro-modal-overlay'),
        modalEditar: document.getElementById('edit-registro-modal-overlay'),
        formCriar: document.getElementById('form-registro-compra'),
        formEditar: document.getElementById('form-edit-registro'),
        tabelaBody: document.getElementById('tabela-registros-body'),
        relatorioContainer: document.getElementById('relatorio-container'),
        relatorioOutput: document.getElementById('relatorio-output')
    };

    // Automatização Status
    document.getElementById('reg-comprador').addEventListener('change', (e) => {
        if (e.target.value !== "") document.getElementById('reg-status').value = 'Em Cotação';
    });
    document.getElementById('edit-reg-comprador').addEventListener('change', (e) => {
        if (e.target.value !== "") document.getElementById('edit-reg-status').value = 'Em Cotação';
    });

    // Timer para TV
    if (refreshInterval) clearInterval(refreshInterval);
    refreshInterval = setInterval(() => {
        const m1 = elementos.modalCriar.style.display === 'flex';
        const m2 = elementos.modalEditar.style.display === 'flex';
        const m3 = elementos.modalBusca.style.display === 'flex';
        if (!m1 && !m2 && !m3) carregarTabela();
    }, 30000);

    // Eventos Modais
    elementos.btnBusca.addEventListener('click', () => elementos.modalBusca.style.display = 'flex');
    elementos.btnCriar.addEventListener('click', () => { elementos.formCriar.reset(); elementos.modalCriar.style.display = 'flex'; });

    document.getElementById('btn-aplicar-filtro').addEventListener('click', () => { aplicarFiltros(); elementos.modalBusca.style.display = 'none'; });
    document.getElementById('btn-limpar-filtros').addEventListener('click', () => {
        ['filtro-fornecedor', 'filtro-comprador', 'filtro-status', 'filtro-data-inicio', 'filtro-data-fim'].forEach(id => document.getElementById(id).value = '');
        aplicarFiltros();
    });

    // Submits
    elementos.formCriar.addEventListener('submit', async (e) => {
        e.preventDefault();
        const dados = {
            fornecedor: document.getElementById('reg-fornecedor').value,
            comprador_nome: document.getElementById('reg-comprador').value,
            status: document.getElementById('reg-status').value,
            observacao: document.getElementById('reg-observacao').value,
            editor_nome: AppState.currentUser.nome
        };
        const res = await fetch('/api/registro-compras', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados) });
        if (res.ok) { elementos.modalCriar.style.display = 'none'; carregarTabela(); }
    });

    elementos.formEditar.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = elementos.formEditar.dataset.id;
        const dados = {
            fornecedor: document.getElementById('edit-reg-fornecedor').value,
            comprador_nome: document.getElementById('edit-reg-comprador').value,
            status: document.getElementById('edit-reg-status').value,
            observacao: document.getElementById('edit-reg-observacao').value
        };
        const res = await fetch(`/api/registro-compras/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados) });
        if (res.ok) { elementos.modalEditar.style.display = 'none'; carregarTabela(); }
    });

    elementos.tabelaBody.addEventListener('click', (e) => {
        const id = e.target.dataset.id;
        if (!id) return;
        if (e.target.classList.contains('btn-edit')) {
            const r = todosRegistros.find(x => x.id == id);
            document.getElementById('edit-reg-fornecedor').value = r.fornecedor;
            document.getElementById('edit-reg-comprador').value = r.comprador_nome || '';
            document.getElementById('edit-reg-status').value = r.status;
            document.getElementById('edit-reg-observacao').value = r.observacao || '';
            elementos.formEditar.dataset.id = id;
            elementos.modalEditar.style.display = 'flex';
        }
        if (e.target.classList.contains('btn-delete')) {
            showConfirmModal("Excluir?", async () => { await fetch(`/api/registro-compras/${id}`, { method: 'DELETE' }); carregarTabela(); });
        }
    });

    elementos.btnRelatorio.addEventListener('click', gerarRelatorio);
    document.getElementById('btn-salvar-relatorio').addEventListener('click', async () => {
        const texto = elementos.relatorioOutput.textContent;
        const res = await fetch('/api/download-relatorio', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: texto });
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `relatorio_compras.txt`; a.click();
    });
    document.getElementById('btn-fechar-relatorio').addEventListener('click', () => elementos.relatorioContainer.style.display = 'none');

    carregarCompradores();
    carregarTabela();
}