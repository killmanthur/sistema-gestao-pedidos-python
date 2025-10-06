import { AppState } from '../state.js';
import { db } from '../firebase.js';
import { showToast } from '../toasts.js';
import { toggleButtonLoading, formatarData, showConfirmModal } from '../ui.js';

let elementos = {};
let todosOsRecebimentos = [];
let debounceTimer;
let dadosFormularioAtual = {};

function openEditModal(item) {
    const modal = elementos.editModal;
    modal.form.dataset.id = item.id;
    modal.form.querySelector('#edit-numero-nota-fiscal').value = item.numero_nota_fiscal;
    modal.form.querySelector('#edit-nome-fornecedor').value = item.nome_fornecedor;
    modal.form.querySelector('#edit-nome-transportadora').value = item.nome_transportadora;
    modal.form.querySelector('#edit-qtd-volumes').value = item.qtd_volumes;

    const perms = AppState.currentUser.permissions || {};
    modal.btnExcluir.style.display = perms.pode_deletar_conferencia ? 'inline-block' : 'none';

    modal.overlay.style.display = 'flex';
}

async function handleEditFormSubmit(event) {
    event.preventDefault();
    const modal = elementos.editModal;
    const id = modal.form.dataset.id;
    const saveButton = modal.saveButton;

    toggleButtonLoading(saveButton, true, 'Salvando...');
    const dados = {
        numero_nota_fiscal: modal.form.querySelector('#edit-numero-nota-fiscal').value,
        nome_fornecedor: modal.form.querySelector('#edit-nome-fornecedor').value,
        nome_transportadora: modal.form.querySelector('#edit-nome-transportadora').value,
        qtd_volumes: modal.form.querySelector('#edit-qtd-volumes').value,
        editor_nome: AppState.currentUser.nome,
    };
    try {
        const response = await fetch(`/api/conferencias/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados),
        });
        if (!response.ok) throw new Error((await response.json()).error);
        showToast('Recebimento atualizado!', 'success');
        modal.overlay.style.display = 'none';
    } catch (error) {
        showToast(`Erro: ${error.message}`, 'error');
    } finally {
        toggleButtonLoading(saveButton, false, 'Salvar Alterações');
    }
}

const handleDelete = (id) => {
    showConfirmModal('Excluir este recebimento? A ação não pode ser desfeita.', async () => {
        try {
            await fetch(`/api/conferencias/${id}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ editor_nome: AppState.currentUser.nome })
            });
            showToast('Recebimento excluído!', 'success');
            // Fecha qualquer modal que esteja aberto
            const openModal = document.querySelector('.modal-overlay[style*="display: flex"]');
            if (openModal) openModal.style.display = 'none';
        } catch (error) {
            showToast(`Erro ao excluir: ${error.message}`, 'error');
        }
    });
};

function renderizarTabela() {
    // ... (função renderizarTabela permanece a mesma)
    const filtrosColunas = {};
    document.querySelectorAll('.filtro-coluna').forEach(input => {
        const colKey = input.dataset.col === 'transportadora_ou_vendedor' ? ['nome_transportadora', 'vendedor_nome'] : [input.dataset.col];
        filtrosColunas[input.dataset.col] = { value: input.value.toLowerCase().trim(), keys: colKey };
    });
    const filtroGeral = elementos.filtroGeral.value.toLowerCase().trim();

    const recebimentosFiltrados = todosOsRecebimentos.filter(item => {
        const searchableValues = Object.values(item).concat(item.vendedor_nome || '');
        if (filtroGeral && !searchableValues.some(val => String(val).toLowerCase().includes(filtroGeral))) {
            return false;
        }
        for (const colName in filtrosColunas) {
            const filtro = filtrosColunas[colName];
            if (filtro.value) {
                const itemHasMatch = filtro.keys.some(key => {
                    const itemValue = key === 'data_recebimento' ? formatarData(item[key]).toLowerCase() : String(item[key] || '').toLowerCase();
                    return itemValue.includes(filtro.value);
                });
                if (!itemHasMatch) return false;
            }
        }
        return true;
    });

    elementos.tabelaBody.innerHTML = '';
    if (recebimentosFiltrados.length === 0) {
        elementos.tabelaBody.innerHTML = `<tr><td colspan="7">Nenhum recebimento encontrado.</td></tr>`;
        return;
    }

    recebimentosFiltrados.forEach(item => {
        const tr = document.createElement('tr');
        if (item.status === 'Finalizado') {
            tr.classList.add('linha-finalizada');
        }

        const perms = AppState.currentUser.permissions || {};
        let actionsHTML = '';

        const rolesPermitidasParaEdicao = ['Admin', 'Estoque', 'Recepção', 'Contabilidade'];
        if (rolesPermitidasParaEdicao.includes(AppState.currentUser.role)) {
            actionsHTML += `<button class="btn-action btn-edit" data-id="${item.id}">Editar</button>`;
        }

        if (perms.pode_deletar_conferencia) {
            actionsHTML += `<button class="btn-action btn-delete" data-id="${item.id}">Excluir</button>`;
        }

        const transportadoraCell = item.vendedor_nome
            ? `<span style="font-weight: bold; color: var(--clr-info);">[RUA] Vendedor: ${item.vendedor_nome}</span>`
            : item.nome_transportadora;

        tr.innerHTML = `
            <td>${formatarData(item.data_recebimento)}</td>
            <td>${item.numero_nota_fiscal}</td>
            <td>${item.nome_fornecedor}</td>
            <td>${transportadoraCell}</td>
            <td>${item.qtd_volumes}</td>
            <td>${item.status}</td>
            <td class="actions-cell">${actionsHTML}</td>
        `;
        tr.querySelector('.btn-edit')?.addEventListener('click', () => openEditModal(item));
        tr.querySelector('.btn-delete')?.addEventListener('click', (e) => handleDelete(e.target.dataset.id));
        elementos.tabelaBody.appendChild(tr);
    });
}

async function handleFormSubmit(event) {
    event.preventDefault();
    dadosFormularioAtual = {
        numero_nota_fiscal: document.getElementById('numero-nota-fiscal').value,
        nome_fornecedor: document.getElementById('nome-fornecedor').value,
        qtd_volumes: document.getElementById('qtd-volumes').value,
        editor_nome: AppState.currentUser.nome
    };

    if (elementos.notaDaRuaCheckbox.checked) {
        dadosFormularioAtual.vendedor_nome = document.getElementById('nome-vendedor').value;
        const modal = elementos.finalizeModal;

        // CORREÇÃO: Limpamos as referências aos checkboxes inexistentes
        modal.title.textContent = "Finalizar Nota da Rua";
        modal.obsInput.value = '';
        modal.overlay.style.display = 'flex';

    } else { // Lógica para nota normal (não da rua)
        dadosFormularioAtual.nome_transportadora = document.getElementById('nome-transportadora').value;
        const submitBtn = elementos.form.querySelector('button[type="submit"]');
        toggleButtonLoading(submitBtn, true, 'Registrando...');
        try {
            const response = await fetch('/api/conferencias/recebimento', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dadosFormularioAtual),
            });
            if (!response.ok) throw new Error((await response.json()).error);
            showToast('Recebimento registrado com sucesso!', 'success');
            elementos.form.reset();
            // Dispara o evento change para resetar a UI do checkbox
            elementos.notaDaRuaCheckbox.checked = false;
            elementos.notaDaRuaCheckbox.dispatchEvent(new Event('change'));
            document.getElementById('numero-nota-fiscal').focus();
        } catch (error) {
            showToast(`Erro: ${error.message}`, 'error');
        } finally {
            toggleButtonLoading(submitBtn, false, 'Registrar Entrada');
        }
    }
}

// NOVA FUNÇÃO para lidar com as ações do modal da Nota da Rua
async function handleFinalizeRuaAction(actionType) {
    const modal = elementos.finalizeModal;
    const observacao = modal.obsInput.value.trim();
    const btn = (actionType === 'ok') ? modal.btnFinalizeOk : modal.btnSolicitarAlteracao;

    // Se for 'solicitar alteração', a observação é obrigatória
    if (actionType === 'alteracao' && !observacao) {
        showToast('A observação é obrigatória para solicitar alteração.', 'error');
        return;
    }

    toggleButtonLoading(btn, true, 'Salvando...');

    const dadosCompletos = {
        ...dadosFormularioAtual,
        observacao: observacao,
        // Define as flags com base no botão clicado
        tem_pendencia_fornecedor: false, // Nota da rua não tem pendência de fornecedor neste fluxo
        solicita_alteracao: actionType === 'alteracao'
    };

    try {
        const response = await fetch('/api/conferencias/recebimento-rua', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dadosCompletos),
        });
        if (!response.ok) throw new Error((await response.json()).error);

        showToast('Nota da Rua registrada com sucesso!', 'success');
        modal.overlay.style.display = 'none';
        elementos.form.reset();
        elementos.notaDaRuaCheckbox.checked = false;
        elementos.notaDaRuaCheckbox.dispatchEvent(new Event('change'));
        document.getElementById('numero-nota-fiscal').focus();

    } catch (error) {
        showToast(`Erro: ${error.message}`, 'error');
    } finally {
        toggleButtonLoading(btn, false, btn.textContent);
    }
}

async function fetchAndPopulateVendors() {
    try {
        const response = await fetch('/api/usuarios/vendedor-nomes');
        if (!response.ok) throw new Error('Falha ao buscar vendedores.');
        const nomes = await response.json();
        const select = document.getElementById('nome-vendedor');
        select.innerHTML = '<option value="" disabled selected>Selecione um vendedor</option>';
        nomes.forEach(nome => {
            select.innerHTML += `<option value="${nome}">${nome}</option>`;
        });
    } catch (error) {
        showToast(error.message, 'error');
    }
}

export function initRecebimentoPage() {
    elementos = {
        form: document.getElementById('form-recebimento'),
        tabela: document.getElementById('tabela-recebimentos'),
        tabelaBody: document.getElementById('tabela-recebimentos-body'),
        spinner: document.getElementById('loading-spinner-tabela'),
        filtroGeral: document.getElementById('filtro-geral-recebimentos'),
        notaDaRuaCheckbox: document.getElementById('nota-da-rua-checkbox'),
        transportadoraGroup: document.getElementById('transportadora-group'),
        transportadoraInput: document.getElementById('nome-transportadora'),
        vendedorGroup: document.getElementById('vendedor-group'),
        vendedorSelect: document.getElementById('nome-vendedor'),
        finalizeModal: {
            overlay: document.getElementById('finalize-modal-overlay'),
            form: document.getElementById('form-finalize'),
            title: document.getElementById('finalize-modal-title'),
            obsInput: document.getElementById('finalize-observacao'),
            btnFinalizeOk: document.getElementById('btn-finalize-ok'),
            btnSolicitarAlteracao: document.getElementById('btn-solicitar-alteracao'),
        },
        editModal: {
            overlay: document.getElementById('edit-recebimento-modal-overlay'),
            form: document.getElementById('form-edit-recebimento'),
            saveButton: document.getElementById('btn-save-edit-recebimento'),
            cancelButton: document.getElementById('btn-cancel-edit-recebimento'),
            btnExcluir: document.getElementById('btn-excluir-recebimento'),
        }
    };

    if (!elementos.form) return;

    // Listeners do formulário principal
    elementos.notaDaRuaCheckbox.addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        elementos.transportadoraGroup.style.display = isChecked ? 'none' : 'block';
        elementos.transportadoraInput.required = !isChecked;
        elementos.vendedorGroup.style.display = isChecked ? 'block' : 'block';
        elementos.vendedorSelect.required = isChecked;
    });
    fetchAndPopulateVendors();
    elementos.form.addEventListener('submit', handleFormSubmit);

    // REMOVIDO o listener antigo do form do modal
    // ADICIONADO listeners para os botões específicos do modal "Nota da Rua"
    if (elementos.finalizeModal.form) {
        elementos.finalizeModal.form.addEventListener('submit', (e) => {
            e.preventDefault();
            handleFinalizeRuaAction('alteracao');
        });
        elementos.finalizeModal.btnFinalizeOk.addEventListener('click', () => {
            handleFinalizeRuaAction('ok');
        });
    }

    // Listeners para o modal de edição
    if (elementos.editModal.form) {
        elementos.editModal.form.addEventListener('submit', handleEditFormSubmit);
        elementos.editModal.btnExcluir.addEventListener('click', () => {
            const id = elementos.editModal.form.dataset.id;
            handleDelete(id);
        });
    }

    // Listeners dos filtros da tabela
    const filtros = document.querySelectorAll('.filtro-coluna, #filtro-geral-recebimentos');
    filtros.forEach(input => {
        input.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(renderizarTabela, 300);
        });
    });

    // Listener do Firebase para atualizar a tabela
    const recebimentosRef = db.ref('conferencias').orderByChild('data_recebimento');
    recebimentosRef.on('value', (snapshot) => {
        elementos.spinner.style.display = 'none';
        elementos.tabela.style.display = 'table';
        const data = snapshot.val() || {};
        todosOsRecebimentos = Object.entries(data).map(([id, value]) => ({ id, ...value }))
            .sort((a, b) => new Date(b.data_recebimento) - new Date(a.data_recebimento));
        renderizarTabela();
    });
}