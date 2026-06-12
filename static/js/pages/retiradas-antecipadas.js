// static/js/pages/retiradas-antecipadas.js
import { AppState } from '../state.js';
import { showToast } from '../toasts.js';
import { formatarData, toggleButtonLoading, showConfirmModal } from '../ui.js';

let elementos = {};
let separadoresLista = [];
let podeConferir = false;
let separadorTag = null;

// --- Tag input simples com autocomplete (seleção única) ---
function createSingleTagInput(container, getOptions) {
    const input = container.querySelector('.tag-input-field');
    const suggestions = container.querySelector('.tag-suggestions');
    let selecionado = '';
    let activeIndex = -1;

    container.addEventListener('click', () => input.focus());

    function render() {
        container.querySelectorAll('.tag-chip').forEach(c => c.remove());
        if (selecionado) {
            const chip = document.createElement('span');
            chip.className = 'tag-chip';
            chip.innerHTML = `${selecionado} <button class="tag-remove" type="button">&times;</button>`;
            container.insertBefore(chip, input);
            input.style.display = 'none';
        } else {
            input.style.display = '';
        }
    }

    function fecharSugestoes() {
        suggestions.innerHTML = '';
        suggestions.classList.remove('open');
        activeIndex = -1;
    }

    function mostrarSugestoes() {
        const q = input.value.trim().toLowerCase();
        const opts = getOptions().filter(n => !q || n.toLowerCase().includes(q));
        if (opts.length === 0 || !q) return fecharSugestoes();
        suggestions.innerHTML = opts.map(n => `<li data-value="${n}">${n}</li>`).join('');
        suggestions.classList.add('open');
        activeIndex = -1;
    }

    function selecionar(nome) {
        selecionado = nome;
        input.value = '';
        fecharSugestoes();
        render();
    }

    input.addEventListener('input', mostrarSugestoes);
    input.addEventListener('keydown', (e) => {
        const itens = Array.from(suggestions.querySelectorAll('li'));
        if (e.key === 'ArrowDown') { e.preventDefault(); activeIndex = Math.min(activeIndex + 1, itens.length - 1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); activeIndex = Math.max(activeIndex - 1, 0); }
        else if (e.key === 'Enter') {
            if (itens.length) { e.preventDefault(); selecionar((itens[activeIndex] || itens[0]).dataset.value); }
        } else if (e.key === 'Escape') { fecharSugestoes(); return; }
        itens.forEach((li, i) => li.classList.toggle('active', i === activeIndex));
    });
    suggestions.addEventListener('click', (e) => {
        const li = e.target.closest('li');
        if (li) selecionar(li.dataset.value);
    });
    container.addEventListener('click', (e) => {
        if (e.target.classList.contains('tag-remove')) { selecionado = ''; render(); }
    });
    document.addEventListener('click', (e) => { if (!container.contains(e.target)) fecharSugestoes(); });

    return {
        getValue: () => selecionado,
        clear: () => { selecionado = ''; render(); },
    };
}

// --- Render da tabela ---
function renderTabela(registros) {
    const tbody = elementos.tbody;
    tbody.innerHTML = '';

    if (!registros || registros.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:2rem;">Nenhuma retirada registrada.</td></tr>';
        return;
    }

    registros.forEach(r => {
        const tr = document.createElement('tr');
        if (r.conferido) tr.classList.add('retirada-ok');

        const checkboxAttrs = podeConferir ? '' : 'disabled title="Você não tem permissão para conferir"';
        // Editar e excluir sao restritos a quem pode conferir (+ Admin).
        const acoesHTML = podeConferir
            ? `<button class="btn-action btn-edit" data-action="editar" data-id="${r.id}">Editar</button>`
              + `<button class="btn-action btn-delete btn-delete--icon" data-action="excluir" data-id="${r.id}" title="Excluir">X</button>`
            : '<span style="color:var(--text-muted);">—</span>';

        tr.innerHTML = `
            <td style="text-align:center;">
                <input type="checkbox" class="retirada-check" data-id="${r.id}" ${r.conferido ? 'checked' : ''} ${checkboxAttrs}>
            </td>
            <td>${formatarDataSimples(r.data)}</td>
            <td><strong>${r.codigo || ''}</strong></td>
            <td>${r.marca || '-'}</td>
            <td>${r.separador_nome || ''}</td>
            <td style="text-align:center;">${r.quantidade ?? ''}</td>
            <td>${r.numero_separacao || '-'}</td>
            <td>${r.criado_por || '-'}</td>
            <td><div class="actions-cell">${acoesHTML}</div></td>
        `;
        tbody.appendChild(tr);
    });
}

// Formata YYYY-MM-DD para DD/MM/YYYY sem depender de fuso.
function formatarDataSimples(data) {
    if (!data) return '-';
    const partes = String(data).slice(0, 10).split('-');
    if (partes.length === 3) return `${partes[2]}/${partes[1]}/${partes[0]}`;
    return data;
}

// --- API ---
async function carregar() {
    elementos.spinner.style.display = 'block';
    elementos.tabela.style.display = 'none';
    try {
        const res = await fetch('/api/retiradas');
        if (!res.ok) throw new Error('Falha ao carregar.');
        const data = await res.json();
        podeConferir = !!data.pode_conferir;
        renderTabela(data.registros);
    } catch (e) {
        showToast('Não foi possível carregar as retiradas.', 'error');
    } finally {
        elementos.spinner.style.display = 'none';
        elementos.tabela.style.display = 'table';
    }
}

async function alternarConferido(id, valor) {
    try {
        const res = await fetch(`/api/retiradas/${id}/conferido`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ conferido: valor }),
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Falha ao atualizar.');
        }
        // Atualiza só a linha (sem recarregar tudo).
        const tr = elementos.tbody.querySelector(`.retirada-check[data-id="${id}"]`)?.closest('tr');
        if (tr) tr.classList.toggle('retirada-ok', valor);
    } catch (e) {
        showToast(e.message, 'error');
        // Reverte o checkbox visualmente.
        const cb = elementos.tbody.querySelector(`.retirada-check[data-id="${id}"]`);
        if (cb) cb.checked = !valor;
    }
}

async function excluir(id) {
    showConfirmModal('Excluir esta retirada?', async () => {
        try {
            const res = await fetch(`/api/retiradas/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Falha ao excluir.');
            showToast('Retirada excluída.', 'success');
            carregar();
        } catch (e) {
            showToast('Não foi possível excluir.', 'error');
        }
    });
}

// --- Edição (modal) ---
function abrirEdicao(id) {
    const overlay = document.getElementById('edit-retirada-modal-overlay');
    const form = document.getElementById('form-edit-retirada');
    // Busca os dados atuais na linha renderizada (evita outra ida ao servidor).
    const cb = elementos.tbody.querySelector(`.retirada-check[data-id="${id}"]`);
    const tr = cb?.closest('tr');
    if (!tr) return;
    const cels = tr.querySelectorAll('td');

    form.dataset.id = id;
    // data: converte DD/MM/YYYY de volta para YYYY-MM-DD.
    const dataTxt = cels[1].textContent.trim();
    const p = dataTxt.split('/');
    document.getElementById('edit-ret-data').value = p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : '';
    document.getElementById('edit-ret-codigo').value = cels[2].textContent.trim();
    document.getElementById('edit-ret-marca').value = cels[3].textContent.trim() === '-' ? '' : cels[3].textContent.trim();
    document.getElementById('edit-ret-quantidade').value = cels[5].textContent.trim();
    const numTxt = cels[6].textContent.trim();
    document.getElementById('edit-ret-numero-separacao').value = numTxt === '-' ? '' : numTxt;

    // Popula o select de separador com a lista + valor atual garantido.
    const atual = cels[4].textContent.trim();
    const opcoes = separadoresLista.includes(atual) ? separadoresLista : [atual, ...separadoresLista];
    const sel = document.getElementById('edit-ret-separador');
    sel.innerHTML = opcoes.map(n => `<option value="${n}" ${n === atual ? 'selected' : ''}>${n}</option>`).join('');

    overlay.style.display = 'flex';
}

async function salvarEdicao(e) {
    e.preventDefault();
    const form = e.target;
    const id = form.dataset.id;
    const submitBtn = form.querySelector('button[type="submit"]');
    toggleButtonLoading(submitBtn, true, 'Salvando...');

    const body = {
        data: document.getElementById('edit-ret-data').value,
        codigo: document.getElementById('edit-ret-codigo').value.trim(),
        marca: document.getElementById('edit-ret-marca').value.trim(),
        separador_nome: document.getElementById('edit-ret-separador').value,
        quantidade: document.getElementById('edit-ret-quantidade').value,
        numero_separacao: document.getElementById('edit-ret-numero-separacao').value.trim(),
    };

    try {
        const res = await fetch(`/api/retiradas/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Falha ao salvar.');
        }
        showToast('Retirada atualizada!', 'success');
        document.getElementById('edit-retirada-modal-overlay').style.display = 'none';
        carregar();
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        toggleButtonLoading(submitBtn, false, 'Salvar Alterações');
    }
}

async function onSubmit(e) {
    e.preventDefault();
    const separador = separadorTag.getValue();
    if (!separador) {
        showToast('Selecione o separador.', 'error');
        return;
    }
    const submitBtn = elementos.form.querySelector('button[type="submit"]');
    toggleButtonLoading(submitBtn, true, 'Salvando...');

    const body = {
        data: document.getElementById('ret-data').value,
        codigo: document.getElementById('ret-codigo').value.trim(),
        marca: document.getElementById('ret-marca').value.trim(),
        separador_nome: separador,
        quantidade: document.getElementById('ret-quantidade').value,
        numero_separacao: document.getElementById('ret-numero-separacao').value.trim(),
    };

    try {
        const res = await fetch('/api/retiradas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Falha ao salvar.');
        }
        showToast('Retirada registrada!', 'success');
        // Limpa o formulário (mantém a data de hoje).
        document.getElementById('ret-codigo').value = '';
        document.getElementById('ret-marca').value = '';
        document.getElementById('ret-quantidade').value = '1';
        document.getElementById('ret-numero-separacao').value = '';
        separadorTag.clear();
        carregar();
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        toggleButtonLoading(submitBtn, false, 'Salvar');
    }
}

export async function initRetiradasAntecipadasPage() {
    elementos = {
        form: document.getElementById('form-retirada'),
        tabela: document.getElementById('tabela-retiradas'),
        tbody: document.getElementById('tabela-retiradas-body'),
        spinner: document.getElementById('ret-loading-spinner'),
    };
    if (!elementos.form) return;

    // Data de hoje (editável) por padrão.
    const hoje = new Date();
    const iso = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
    document.getElementById('ret-data').value = iso;

    // Lista de separadores para o autocomplete.
    try {
        const res = await fetch('/api/usuarios/separador-nomes');
        if (res.ok) separadoresLista = (await res.json()).filter(n => n.toLowerCase() !== 'separacao');
    } catch (e) { /* segue sem autocomplete */ }

    separadorTag = createSingleTagInput(document.getElementById('ret-separador-tag'), () => separadoresLista);

    elementos.form.addEventListener('submit', onSubmit);

    // Delegação: checkbox e excluir.
    elementos.tbody.addEventListener('change', (e) => {
        const cb = e.target.closest('.retirada-check');
        if (cb && !cb.disabled) alternarConferido(cb.dataset.id, cb.checked);
    });
    elementos.tbody.addEventListener('click', (e) => {
        const editBtn = e.target.closest('[data-action="editar"]');
        if (editBtn) { abrirEdicao(editBtn.dataset.id); return; }
        const delBtn = e.target.closest('[data-action="excluir"]');
        if (delBtn) excluir(delBtn.dataset.id);
    });

    // Submit do modal de edição.
    const formEdit = document.getElementById('form-edit-retirada');
    if (formEdit) formEdit.addEventListener('submit', salvarEdicao);

    // Atualização em tempo real (outros usuários cadastrando/conferindo).
    if (AppState.socket) {
        AppState.socket.on('retiradas_atualizado', carregar);
    }

    carregar();
}
