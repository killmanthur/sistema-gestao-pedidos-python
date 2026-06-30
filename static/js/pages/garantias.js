// static/js/pages/garantias.js
import { AppState } from '../state.js';
import { showToast } from '../toasts.js';
import { formatarData, toggleButtonLoading, showConfirmModal } from '../ui.js';

let elementos = {};
let todos = [];          // cache dos registros pendentes
let termoBusca = '';
let podeEditar = false;
let garantiaAtual = null; // registro aberto no modal

// --- Helpers ---
function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// YYYY-MM-DD -> DD/MM/YYYY (sem depender de fuso)
function formatarDataSimples(data) {
    if (!data) return '-';
    const p = String(data).slice(0, 10).split('-');
    if (p.length === 3) return `${p[2]}/${p[1]}/${p[0]}`;
    return data;
}

function hojeISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// --- Render da tabela ---
function renderTabela(registros) {
    const tbody = elementos.tbody;
    tbody.innerHTML = '';

    if (!registros || registros.length === 0) {
        const msg = termoBusca.trim()
            ? 'Nenhuma garantia encontrada para a busca.'
            : 'Nenhuma garantia pendente.';
        tbody.innerHTML = `<tr><td colspan="11" style="text-align:center; padding:2rem;">${msg}</td></tr>`;
        return;
    }

    registros.forEach(g => {
        const tr = document.createElement('tr');
        const nAcomp = (g.acompanhamento || []).length;
        tr.innerHTML = `
            <td><strong>${escapeHtml(g.nome_cliente)}</strong></td>
            <td>${escapeHtml(g.codigo_peca)}</td>
            <td>${escapeHtml(g.descricao_peca) || '-'}</td>
            <td>${escapeHtml(g.marca) || '-'}</td>
            <td>${escapeHtml(g.fornecedor) || '-'}</td>
            <td style="text-align:center;">${g.quantidade ?? 1}</td>
            <td>${formatarDataSimples(g.data_inicio)}</td>
            <td>${formatarDataSimples(g.data_envio_fornecedor)}</td>
            <td>${escapeHtml(g.tempo_decorrido)}</td>
            <td style="text-align:center;">${nAcomp}</td>
            <td><div class="actions-cell">
                <button class="btn-action" data-action="acompanhar" data-id="${g.id}">Acompanhar</button>
                ${podeEditar ? `<button class="btn-action" data-action="editar" data-id="${g.id}">Editar</button>` : ''}
                ${podeEditar ? `<button class="btn-action btn-delete btn-delete--icon" data-action="excluir" data-id="${g.id}" title="Excluir">X</button>` : ''}
            </div></td>
        `;
        tbody.appendChild(tr);
    });
}

function aplicarFiltro() {
    const q = termoBusca.trim().toLowerCase();
    if (!q) return renderTabela(todos);
    const filtrados = todos.filter(g => {
        const campos = [
            g.nome_cliente, g.codigo_peca, g.descricao_peca,
            g.marca, g.fornecedor, g.defeito,
        ];
        return campos.some(c => String(c || '').toLowerCase().includes(q));
    });
    renderTabela(filtrados);
}

// --- API ---
async function carregar() {
    elementos.spinner.style.display = 'block';
    elementos.tabela.style.display = 'none';
    try {
        const res = await fetch('/api/garantias?aba=pendentes');
        if (!res.ok) throw new Error('Falha ao carregar.');
        const data = await res.json();
        podeEditar = !!data.pode_editar;
        todos = data.registros || [];
        aplicarFiltro();
        // Mantém o modal sincronizado se estiver aberto.
        if (garantiaAtual) {
            const atualizado = todos.find(g => g.id === garantiaAtual.id);
            if (atualizado) {
                garantiaAtual = atualizado;
                renderTimeline(garantiaAtual);
                renderMeta(garantiaAtual);
            }
        }
    } catch (e) {
        showToast('Não foi possível carregar as garantias.', 'error');
    } finally {
        elementos.spinner.style.display = 'none';
        elementos.tabela.style.display = 'table';
    }
}

// --- Cadastro ---
async function onSubmitCriar(e) {
    e.preventDefault();
    const submitBtn = elementos.form.querySelector('button[type="submit"]');
    toggleButtonLoading(submitBtn, true, 'Salvar Garantia');

    const body = {
        nome_cliente: val('g-nome-cliente'),
        codigo_peca: val('g-codigo'),
        descricao_peca: val('g-descricao'),
        marca: val('g-marca'),
        fornecedor: val('g-fornecedor'),
        defeito: val('g-defeito'),
        quantidade: val('g-quantidade'),
        data_inicio: val('g-data-inicio'),
        data_envio_fornecedor: val('g-data-envio'),
    };

    try {
        const res = await fetch('/api/garantias', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Falha ao salvar.');
        }
        showToast('Garantia registrada!', 'success');
        document.getElementById('garantia-novo-modal-overlay').style.display = 'none';
        elementos.form.reset();
        document.getElementById('g-data-inicio').value = hojeISO();
        document.getElementById('g-quantidade').value = '1';
        carregar();
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        toggleButtonLoading(submitBtn, false, 'Salvar Garantia');
    }
}

async function excluir(id) {
    showConfirmModal('Excluir este processo de garantia?', async () => {
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

// --- Modal de edição de dados ---
function abrirEdicao(id) {
    const g = todos.find(x => x.id === Number(id));
    if (!g) return;

    document.getElementById('edit-g-id').value = g.id;
    document.getElementById('edit-g-nome-cliente').value = g.nome_cliente || '';
    document.getElementById('edit-g-codigo').value = g.codigo_peca || '';
    document.getElementById('edit-g-quantidade').value = g.quantidade || 1;
    document.getElementById('edit-g-descricao').value = g.descricao_peca || '';
    document.getElementById('edit-g-marca').value = g.marca || '';
    document.getElementById('edit-g-fornecedor').value = g.fornecedor || '';
    document.getElementById('edit-g-defeito').value = g.defeito || '';
    document.getElementById('edit-g-data-inicio').value = (g.data_inicio || '').slice(0, 10);
    document.getElementById('edit-g-data-envio').value = (g.data_envio_fornecedor || '').slice(0, 10);

    document.getElementById('garantia-edit-modal-title').textContent =
        `Editar — ${g.nome_cliente || ''} (${g.codigo_peca || ''})`;

    document.getElementById('garantia-edit-modal-overlay').style.display = 'flex';
}

// --- Modal de acompanhamento + finalização ---
function abrirAcompanhamento(id) {
    const g = todos.find(x => x.id === Number(id));
    if (!g) return;
    garantiaAtual = g;

    document.getElementById('garantia-acomp-modal-title').textContent =
        `Garantia — ${g.nome_cliente || ''} (${g.codigo_peca || ''})`;

    // Finalização: data final padrão hoje.
    document.getElementById('fin-status').value = 'Concedida';
    document.getElementById('fin-data-final').value = hojeISO();
    document.getElementById('fin-conclusao').value = g.conclusao || '';

    renderMeta(g);
    renderTimeline(g);
    document.getElementById('acomp-texto').value = '';

    document.getElementById('garantia-acomp-modal-overlay').style.display = 'flex';
}

function renderMeta(g) {
    const meta = document.getElementById('garantia-meta');
    const partes = [];
    if (g.criado_por) partes.push(`Criado por <strong>${escapeHtml(g.criado_por)}</strong> em ${formatarData(g.data_criacao)}`);
    if (g.tempo_decorrido) partes.push(`Tempo decorrido: <strong>${escapeHtml(g.tempo_decorrido)}</strong>`);
    meta.innerHTML = partes.join(' · ');
}

function renderTimeline(g) {
    const lista = document.getElementById('acomp-lista');
    const entradas = g.acompanhamento || [];
    if (entradas.length === 0) {
        lista.innerHTML = `<li class="garantia-timeline-empty">Nenhum acompanhamento ainda.</li>`;
        return;
    }
    // Mais recentes primeiro (mantém o índice original para a API).
    lista.innerHTML = entradas
        .map((e, i) => ({ e, i }))
        .reverse()
        .map(({ e, i }) => {
            const editado = e.editado_em
                ? ` <em>(editado por ${escapeHtml(e.editado_por || '')} em ${formatarData(e.editado_em)})</em>`
                : '';
            const acoes = podeEditar
                ? `<div class="garantia-timeline-acoes">
                       <button class="btn-link" data-acomp-edit="${i}">Editar</button>
                       <button class="btn-link btn-link--danger" data-acomp-del="${i}">Excluir</button>
                   </div>`
                : '';
            return `<li class="garantia-timeline-item" data-idx="${i}">
                <div class="garantia-timeline-head">
                    <span class="garantia-timeline-autor">${escapeHtml(e.autor || 'N/A')}</span>
                    <span class="garantia-timeline-data">${formatarData(e.timestamp)}${editado}</span>
                </div>
                <div class="garantia-timeline-texto">${escapeHtml(e.texto).replace(/\n/g, '<br>')}</div>
                ${acoes}
            </li>`;
        }).join('');
}

async function salvarDados(e) {
    e.preventDefault();
    const id = document.getElementById('edit-g-id').value;
    if (!id) return;
    const submitBtn = e.target.querySelector('button[type="submit"]');
    toggleButtonLoading(submitBtn, true, 'Salvar Dados');

    const body = {
        nome_cliente: val('edit-g-nome-cliente'),
        codigo_peca: val('edit-g-codigo'),
        quantidade: val('edit-g-quantidade'),
        descricao_peca: val('edit-g-descricao'),
        marca: val('edit-g-marca'),
        fornecedor: val('edit-g-fornecedor'),
        defeito: val('edit-g-defeito'),
        data_inicio: val('edit-g-data-inicio'),
        data_envio_fornecedor: val('edit-g-data-envio'),
    };
    try {
        const res = await fetch(`/api/garantias/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Falha ao salvar.');
        }
        showToast('Dados atualizados!', 'success');
        document.getElementById('garantia-edit-modal-overlay').style.display = 'none';
        carregar();
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        toggleButtonLoading(submitBtn, false, 'Salvar Dados');
    }
}

async function adicionarAcompanhamento(e) {
    e.preventDefault();
    if (!garantiaAtual) return;
    const texto = document.getElementById('acomp-texto').value.trim();
    if (!texto) { showToast('Escreva o acompanhamento.', 'error'); return; }
    const submitBtn = e.target.querySelector('button[type="submit"]');
    toggleButtonLoading(submitBtn, true, 'Adicionar');
    try {
        const res = await fetch(`/api/garantias/${garantiaAtual.id}/acompanhamento`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ texto }),
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Falha ao adicionar.');
        }
        const data = await res.json();
        garantiaAtual = data.registro;
        document.getElementById('acomp-texto').value = '';
        renderTimeline(garantiaAtual);
        renderMeta(garantiaAtual);
        carregar();
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        toggleButtonLoading(submitBtn, false, 'Adicionar');
    }
}

// Edição inline de um acompanhamento
function editarAcompanhamentoInline(idx) {
    const li = document.querySelector(`#acomp-lista .garantia-timeline-item[data-idx="${idx}"]`);
    if (!li || !garantiaAtual) return;
    const entrada = (garantiaAtual.acompanhamento || [])[idx];
    if (!entrada) return;
    const textoDiv = li.querySelector('.garantia-timeline-texto');
    const acoes = li.querySelector('.garantia-timeline-acoes');
    if (acoes) acoes.style.display = 'none';
    textoDiv.innerHTML = `
        <textarea class="acomp-edit-area" rows="2">${escapeHtml(entrada.texto)}</textarea>
        <div class="garantia-timeline-acoes">
            <button class="btn-link" data-acomp-save="${idx}">Salvar</button>
            <button class="btn-link" data-acomp-cancel="${idx}">Cancelar</button>
        </div>`;
    textoDiv.querySelector('textarea').focus();
}

async function salvarAcompanhamentoEdit(idx) {
    const li = document.querySelector(`#acomp-lista .garantia-timeline-item[data-idx="${idx}"]`);
    const area = li?.querySelector('.acomp-edit-area');
    const texto = (area?.value || '').trim();
    if (!texto) { showToast('O texto não pode ficar vazio.', 'error'); return; }
    try {
        const res = await fetch(`/api/garantias/${garantiaAtual.id}/acompanhamento/${idx}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ texto }),
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Falha ao salvar.');
        }
        const data = await res.json();
        garantiaAtual = data.registro;
        renderTimeline(garantiaAtual);
        carregar();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function excluirAcompanhamento(idx) {
    showConfirmModal('Excluir este acompanhamento?', async () => {
        try {
            const res = await fetch(`/api/garantias/${garantiaAtual.id}/acompanhamento/${idx}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Falha ao excluir.');
            const data = await res.json();
            garantiaAtual = data.registro;
            renderTimeline(garantiaAtual);
            carregar();
        } catch (e) {
            showToast('Não foi possível excluir.', 'error');
        }
    });
}

async function finalizar() {
    if (!garantiaAtual) return;
    const status = document.getElementById('fin-status').value;
    const data_final = document.getElementById('fin-data-final').value;
    const conclusao = document.getElementById('fin-conclusao').value.trim();
    showConfirmModal(
        `Finalizar como "${status}"? O processo irá para a aba de Finalizadas.`,
        async () => {
            const btn = document.getElementById('btn-finalizar-garantia');
            toggleButtonLoading(btn, true, 'Finalizar');
            try {
                const res = await fetch(`/api/garantias/${garantiaAtual.id}/status`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status, data_final, conclusao }),
                });
                if (!res.ok) {
                    const err = await res.json();
                    throw new Error(err.error || 'Falha ao finalizar.');
                }
                showToast(`Garantia finalizada como ${status}.`, 'success');
                document.getElementById('garantia-acomp-modal-overlay').style.display = 'none';
                garantiaAtual = null;
                carregar();
            } catch (err) {
                showToast(err.message, 'error');
            } finally {
                toggleButtonLoading(btn, false, 'Finalizar');
            }
        }
    );
}

function val(id) {
    return (document.getElementById(id)?.value || '').trim();
}

export async function initGarantiasPage() {
    elementos = {
        form: document.getElementById('form-garantia'),
        tabela: document.getElementById('tabela-garantias'),
        tbody: document.getElementById('tabela-garantias-body'),
        spinner: document.getElementById('g-loading-spinner'),
        busca: document.getElementById('g-busca'),
        btnNova: document.getElementById('btn-nova-garantia'),
    };
    if (!elementos.tabela) return;

    // Data de hoje no início por padrão.
    document.getElementById('g-data-inicio').value = hojeISO();

    // Abrir o modal de nova garantia.
    elementos.btnNova?.addEventListener('click', () => {
        elementos.form.reset();
        document.getElementById('g-data-inicio').value = hojeISO();
        document.getElementById('g-quantidade').value = '1';
        document.getElementById('garantia-novo-modal-overlay').style.display = 'flex';
        document.getElementById('g-nome-cliente').focus();
    });

    elementos.form?.addEventListener('submit', onSubmitCriar);

    // Busca.
    elementos.busca?.addEventListener('input', (e) => {
        termoBusca = e.target.value;
        aplicarFiltro();
    });

    // Ações na tabela.
    elementos.tbody.addEventListener('click', (e) => {
        const acomp = e.target.closest('[data-action="acompanhar"]');
        if (acomp) { abrirAcompanhamento(acomp.dataset.id); return; }
        const editar = e.target.closest('[data-action="editar"]');
        if (editar) { abrirEdicao(editar.dataset.id); return; }
        const del = e.target.closest('[data-action="excluir"]');
        if (del) excluir(del.dataset.id);
    });

    // Modal: salvar dados / acompanhamento / finalizar.
    document.getElementById('form-edit-garantia')?.addEventListener('submit', salvarDados);
    document.getElementById('form-acompanhamento')?.addEventListener('submit', adicionarAcompanhamento);
    document.getElementById('btn-finalizar-garantia')?.addEventListener('click', finalizar);

    // Delegação dos botões da timeline.
    document.getElementById('acomp-lista')?.addEventListener('click', (e) => {
        const edit = e.target.closest('[data-acomp-edit]');
        if (edit) { editarAcompanhamentoInline(Number(edit.dataset.acompEdit)); return; }
        const del = e.target.closest('[data-acomp-del]');
        if (del) { excluirAcompanhamento(Number(del.dataset.acompDel)); return; }
        const save = e.target.closest('[data-acomp-save]');
        if (save) { salvarAcompanhamentoEdit(Number(save.dataset.acompSave)); return; }
        const cancel = e.target.closest('[data-acomp-cancel]');
        if (cancel) { renderTimeline(garantiaAtual); return; }
    });

    // O fechamento dos modais (overlay, botão × e Esc) é tratado globalmente
    // por setupAllModalCloseHandlers (ui.js), que já evita fechar ao selecionar
    // texto e soltar o mouse fora do modal.

    // Tempo real.
    if (AppState.socket) {
        AppState.socket.on('garantias_atualizado', carregar);
    }

    carregar();
}
