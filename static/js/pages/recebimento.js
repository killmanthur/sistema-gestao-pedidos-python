// static/js/pages/recebimento.js
import { AppState } from '../state.js';
import { showToast } from '../toasts.js';
import { toggleButtonLoading, formatarData, showConfirmModal } from '../ui.js';

// --- 1. Variáveis de Estado Globais ---
let elementos = {};
let debounceTimer;
let currentPage = 0;
let isLoading = false;
let hasMore = true;
let currentSearch = '';

// Variáveis para armazenar os filtros ativos (necessário para a paginação funcionar)
let dataInicio = '';
let dataFim = '';
let statusFiltro = '';

// --- 2. Funções Auxiliares ---

async function fetchAndPopulateVendorsCheckbox(containerElement) {
    containerElement.innerHTML = '<div class="spinner"></div>';
    try {
        const response = await fetch('/api/usuarios/destinos-rua');
        if (!response.ok) throw new Error('Falha ao buscar destinos.');
        const listaDeVendedores = await response.json();

        containerElement.innerHTML = '';
        if (listaDeVendedores.length === 0) {
            containerElement.innerHTML = '<p>Nenhum vendedor encontrado.</p>';
            return;
        }

        listaDeVendedores.forEach(nome => {
            const label = document.createElement('label');
            label.innerHTML = `<input type="checkbox" value="${nome}"> ${nome}`;
            containerElement.appendChild(label);
        });
    } catch (error) {
        showToast(error.message, 'error');
        containerElement.innerHTML = '<p style="color:var(--clr-danger)">Erro ao carregar.</p>';
    }
}

function getStatusClass(status) {
    if (!status) return '';
    const s = status.toLowerCase();
    if (s.includes('aguardando')) return 'status-aguardando';
    if (s.includes('em conferência') || s.includes('em conferencia')) return 'status-em-conferencia';
    if (s.includes('pendente')) return 'status-pendente';
    if (s.includes('finalizado')) return 'status-finalizado';
    return '';
}

async function openEditModal(item) {
    const modal = elementos.editModal;
    modal.form.dataset.id = item.id;

    // Preenche os campos de texto padrão
    modal.form.querySelector('#edit-numero-nota-fiscal').value = item.numero_nota_fiscal;
    modal.form.querySelector('#edit-nome-fornecedor').value = item.nome_fornecedor;
    modal.form.querySelector('#edit-qtd-volumes').value = item.qtd_volumes;
    modal.form.querySelector('#edit-recebido-por').value = item.recebido_por || '';

    const transportadoraGroup = document.getElementById('edit-transportadora-group');
    const vendedorGroup = document.getElementById('edit-vendedor-group');
    const vendedoresContainer = document.getElementById('edit-vendedores-container');

    // Lógica de Exibição (Rua vs Fornecedor)
    if (item.vendedor_nome) { // É nota da rua
        transportadoraGroup.style.display = 'none';
        vendedorGroup.style.display = 'block';

        // 1. Prepara o container
        vendedoresContainer.innerHTML = '<div class="spinner"></div>';

        try {
            // 2. Busca a lista atualizada de vendedores
            const response = await fetch('/api/usuarios/destinos-rua');
            const listaDeVendedores = await response.json();

            // 3. Identifica quais vendedores já estão nessa nota
            // Transforma "Alison, Roger" em ["Alison", "Roger"]
            const vendedoresAtuais = item.vendedor_nome.split(',').map(s => s.trim());

            vendedoresContainer.innerHTML = ''; // Limpa o spinner

            // 4. Cria os checkboxes
            listaDeVendedores.forEach(nome => {
                const label = document.createElement('label');
                const isChecked = vendedoresAtuais.includes(nome) ? 'checked' : '';

                label.innerHTML = `<input type="checkbox" value="${nome}" ${isChecked}> ${nome}`;
                vendedoresContainer.appendChild(label);
            });

        } catch (error) {
            console.error(error);
            vendedoresContainer.innerHTML = '<p style="color:red">Erro ao carregar lista.</p>';
        }

    } else { // É nota de fornecedor
        transportadoraGroup.style.display = 'block';
        vendedorGroup.style.display = 'none';
        modal.form.querySelector('#edit-nome-transportadora').value = item.nome_transportadora;
    }

    // Botão de excluir (se tiver permissão)
    const perms = AppState.currentUser.permissions || {};
    modal.btnExcluir.style.display = perms.pode_deletar_conferencia ? 'inline-block' : 'none';

    modal.overlay.style.display = 'flex';
}

// --- Função para Salvar Edição (Atualizada) ---
async function handleEditFormSubmit(event) {
    event.preventDefault();
    const modal = elementos.editModal;
    const id = modal.form.dataset.id;
    const saveButton = modal.saveButton;
    toggleButtonLoading(saveButton, true, 'Salvando...');

    // Dados comuns
    const dados = {
        numero_nota_fiscal: modal.form.querySelector('#edit-numero-nota-fiscal').value,
        nome_fornecedor: modal.form.querySelector('#edit-nome-fornecedor').value,
        qtd_volumes: modal.form.querySelector('#edit-qtd-volumes').value,
        recebido_por: modal.form.querySelector('#edit-recebido-por').value,
        editor_nome: AppState.currentUser.nome,
    };

    const isRua = document.getElementById('edit-vendedor-group').style.display === 'block';

    if (isRua) {
        // Lógica para coletar os checkboxes marcados
        const container = document.getElementById('edit-vendedores-container');
        const checkboxes = container.querySelectorAll('input[type="checkbox"]:checked');
        const selecionados = Array.from(checkboxes).map(cb => cb.value);

        if (selecionados.length === 0) {
            showToast('Selecione pelo menos um vendedor.', 'error');
            toggleButtonLoading(saveButton, false, 'Salvar Alterações');
            return;
        }

        // Junta o array em uma string separada por vírgula
        dados.vendedor_nome = selecionados.join(', ');
        dados.nome_transportadora = 'NOTA DA RUA'; // Garante consistência

    } else {
        dados.nome_transportadora = document.getElementById('edit-nome-transportadora').value;
        dados.vendedor_nome = null; // Garante que limpa se mudou o tipo (caso raro)
    }

    try {
        const response = await fetch(`/api/conferencias/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados),
        });
        if (!response.ok) throw new Error((await response.json()).error);

        showToast('Recebimento atualizado!', 'success');
        modal.overlay.style.display = 'none';
        loadRecebimentos(true);

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
            const openModal = document.querySelector('.modal-overlay[style*="display: flex"]');
            if (openModal) openModal.style.display = 'none';
            loadRecebimentos(true);
        } catch (error) {
            showToast(`Erro ao excluir: ${error.message}`, 'error');
        }
    });
};

async function handleFornecedorFormSubmit(event) {
    event.preventDefault();
    const modal = elementos.modalFornecedor;
    const submitBtn = modal.form.querySelector('button[type="submit"]');
    toggleButtonLoading(submitBtn, true, 'Registrando...');

    const dados = {
        numero_nota_fiscal: document.getElementById('fornecedor-numero-nota').value,
        nome_fornecedor: document.getElementById('fornecedor-nome').value,
        nome_transportadora: document.getElementById('fornecedor-transportadora').value,
        qtd_volumes: document.getElementById('fornecedor-qtd-volumes').value,
        recebido_por: document.getElementById('fornecedor-recebido-por').value,
        observacao: document.getElementById('fornecedor-observacao').value,
        editor_nome: AppState.currentUser.nome
    };

    try {
        const response = await fetch('/api/conferencias/recebimento', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados),
        });
        if (!response.ok) throw new Error((await response.json()).error);
        showToast('Recebimento de fornecedor registrado!', 'success');
        modal.form.reset();
        modal.overlay.style.display = 'none';
        loadRecebimentos(true);
    } catch (error) {
        showToast(`Erro: ${error.message}`, 'error');
    } finally {
        toggleButtonLoading(submitBtn, false, 'Registrar Entrada');
    }
}

async function handleRuaFormAction(actionType, event) {
    const modal = elementos.modalRua;
    const btn = event.target;
    const observacao = modal.obsInput.value.trim();

    if (actionType === 'alteracao' && !observacao) {
        showToast('A observação é obrigatória para solicitar alteração.', 'error');
        return;
    }

    const containerCheckbox = document.getElementById('rua-vendedores-container');
    const checkboxes = containerCheckbox.querySelectorAll('input[type="checkbox"]:checked');
    const vendedoresSelecionados = Array.from(checkboxes).map(cb => cb.value);

    if (vendedoresSelecionados.length === 0) {
        showToast('Selecione pelo menos um responsável/vendedor.', 'error');
        return;
    }

    const vendedoresString = vendedoresSelecionados.join(', ');

    toggleButtonLoading(btn, true, 'Salvando...');

    const dadosRecebimento = {
        numero_nota_fiscal: document.getElementById('rua-numero-nota').value,
        nome_fornecedor: document.getElementById('rua-nome-fornecedor').value,
        vendedor_nome: vendedoresString,
        qtd_volumes: document.getElementById('rua-qtd-volumes').value,
        recebido_por: document.getElementById('rua-recebido-por').value,
        editor_nome: AppState.currentUser.nome,
        solicita_alteracao: actionType === 'alteracao',
        tem_pendencia_fornecedor: false,
        observacao: observacao,
    };

    try {
        const response = await fetch('/api/conferencias/recebimento-rua', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dadosRecebimento),
        });
        if (!response.ok) throw new Error((await response.json()).error);
        showToast('Nota da Rua registrada com sucesso!', 'success');
        modal.form.reset();
        containerCheckbox.querySelectorAll('input').forEach(cb => cb.checked = false);
        modal.overlay.style.display = 'none';
        loadRecebimentos(true);
    } catch (error) {
        showToast(`Erro: ${error.message}`, 'error');
    } finally {
        toggleButtonLoading(btn, false, btn.textContent);
    }
}

// --- 4. Lógica de Carregamento e Renderização ---

function renderizarLinhas(listaRecebimentos, limpar = false) {
    if (limpar) {
        elementos.tabelaBody.innerHTML = '';
    }

    if (listaRecebimentos.length === 0 && limpar) {
        elementos.tabelaBody.innerHTML = `<tr><td colspan="8">Nenhum recebimento encontrado.</td></tr>`;
        return;
    }

    listaRecebimentos.forEach(item => {
        const tr = document.createElement('tr');

        const classeStatus = getStatusClass(item.status);
        if (classeStatus) tr.classList.add(classeStatus);

        const perms = AppState.currentUser.permissions || {};
        let actionsHTML = '';

        const rolesPermitidasParaEdicao = ['Admin', 'Estoque', 'Recepção', 'Contabilidade'];
        if (rolesPermitidasParaEdicao.includes(AppState.currentUser.role)) {
            actionsHTML += `<button class="btn-action btn-edit" data-id="${item.id}">Editar</button>`;
        }

        if (perms.pode_deletar_conferencia) {
            actionsHTML += `<button class="btn-action btn-delete btn-delete--icon" data-id="${item.id}" title="Excluir">X</button>`;
        }

        const transportadoraCell = item.vendedor_nome
            ? `<span style="font-weight: bold; color: var(--clr-info);">[RUA] ${item.vendedor_nome}</span>`
            : item.nome_transportadora;

        tr.innerHTML = `
            <td>${formatarData(item.data_recebimento)}</td>
            <td>${item.numero_nota_fiscal}</td>
            <td>${item.nome_fornecedor}</td>
            <td>${transportadoraCell}</td>
            <td>${item.qtd_volumes}</td>
            <td>${item.recebido_por || ''}</td>
            <td>${item.status}</td>
            <td class="actions-cell">${actionsHTML}</td>
        `;
        tr.querySelector('.btn-edit')?.addEventListener('click', () => openEditModal(item));
        tr.querySelector('.btn-delete')?.addEventListener('click', (e) => handleDelete(e.target.dataset.id));
        elementos.tabelaBody.appendChild(tr);
    });
}

async function loadRecebimentos(reload = false) {
    if (isLoading) return;

    if (reload) {
        currentPage = 0;
        hasMore = true;
        elementos.spinner.style.display = 'block';

        // Captura os valores atuais dos inputs APENAS no reload inicial
        if (elementos.filtroDataInicio) dataInicio = elementos.filtroDataInicio.value;
        if (elementos.filtroDataFim) dataFim = elementos.filtroDataFim.value;
        if (elementos.filtroStatus) statusFiltro = elementos.filtroStatus.value;
        if (elementos.filtroGeral) currentSearch = elementos.filtroGeral.value;

    } else if (!hasMore) {
        return;
    }

    isLoading = true;
    const btnCarregarMais = document.getElementById('btn-carregar-mais');
    if (btnCarregarMais) {
        btnCarregarMais.textContent = 'Carregando...';
        btnCarregarMais.disabled = true;
    }

    try {
        const response = await fetch('/api/conferencias/recebimentos-paginados', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                page: currentPage,
                limit: 50,
                search: currentSearch,
                dataInicio: dataInicio, // Agora esta variável existe no escopo global do arquivo
                dataFim: dataFim,       // Esta também
                status: statusFiltro    // E esta
            })
        });

        if (!response.ok) throw new Error('Erro ao buscar dados');
        const data = await response.json();

        renderizarLinhas(data.recebimentos, reload);

        hasMore = data.temMais;
        if (hasMore) {
            currentPage++;
        }

        if (reload) {
            elementos.tabela.style.display = 'table';
            elementos.spinner.style.display = 'none';
        }

        if (btnCarregarMais) {
            btnCarregarMais.style.display = hasMore ? 'block' : 'none';
            btnCarregarMais.textContent = 'Carregar mais antigos';
            btnCarregarMais.disabled = false;
        }

    } catch (error) {
        console.error(error);
        showToast('Erro ao carregar recebimentos.', 'error');
    } finally {
        isLoading = false;
    }
}

// --- 5. Inicialização ---

export function initRecebimentoPage() {
    elementos = {
        btnAbrirModalFornecedor: document.getElementById('btn-abrir-modal-fornecedor'),
        btnAbrirModalRua: document.getElementById('btn-abrir-modal-rua'),
        modalFornecedor: {
            overlay: document.getElementById('modal-fornecedor-overlay'),
            form: document.getElementById('form-nota-fornecedor'),
        },
        modalRua: {
            overlay: document.getElementById('modal-rua-overlay'),
            form: document.getElementById('form-nota-rua'),
            obsInput: document.getElementById('rua-observacao'),
            btnFinalizeOk: document.getElementById('btn-rua-finalize-ok'),
            btnSolicitarAlteracao: document.getElementById('btn-rua-solicitar-alteracao'),
        },
        tabela: document.getElementById('tabela-recebimentos'),
        tabelaBody: document.getElementById('tabela-recebimentos-body'),
        spinner: document.getElementById('loading-spinner-tabela'),

        // Filtros
        filtroGeral: document.getElementById('filtro-geral-recebimentos'),
        filtroDataInicio: document.getElementById('filtro-data-inicio'),
        filtroDataFim: document.getElementById('filtro-data-fim'),
        filtroStatus: document.getElementById('filtro-status'),
        btnLimparFiltros: document.getElementById('btn-limpar-filtros-recebimento'),

        editModal: {
            overlay: document.getElementById('edit-recebimento-modal-overlay'),
            form: document.getElementById('form-edit-recebimento'),
            saveButton: document.getElementById('btn-save-edit-recebimento'),
            btnExcluir: document.getElementById('btn-excluir-recebimento'),
        },
        btnCarregarMais: document.getElementById('btn-carregar-mais')
    };

    if (!elementos.btnAbrirModalFornecedor) return;

    elementos.btnAbrirModalFornecedor.addEventListener('click', () => {
        elementos.modalFornecedor.overlay.style.display = 'flex';
    });

    elementos.btnAbrirModalRua.addEventListener('click', () => {
        fetchAndPopulateVendorsCheckbox(document.getElementById('rua-vendedores-container'));
        elementos.modalRua.overlay.style.display = 'flex';
    });

    elementos.modalFornecedor.form.addEventListener('submit', handleFornecedorFormSubmit);

    elementos.modalRua.btnSolicitarAlteracao.addEventListener('click', (e) => {
        e.preventDefault();
        handleRuaFormAction('alteracao', e);
    });
    elementos.modalRua.btnFinalizeOk.addEventListener('click', (e) => {
        e.preventDefault();
        handleRuaFormAction('ok', e);
    });

    if (elementos.editModal.form) {
        elementos.editModal.form.addEventListener('submit', handleEditFormSubmit);
        elementos.editModal.btnExcluir.addEventListener('click', () => {
            const id = elementos.editModal.form.dataset.id;
            handleDelete(id);
        });
    }

    // Filtro Geral (Debounce)
    elementos.filtroGeral.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            loadRecebimentos(true);
        }, 500);
    });

    // Filtros Específicos
    const inputsFiltro = [elementos.filtroDataInicio, elementos.filtroDataFim, elementos.filtroStatus];
    inputsFiltro.forEach(el => {
        if (el) {
            el.addEventListener('change', () => {
                loadRecebimentos(true);
            });
        }
    });

    // Limpar Filtros
    if (elementos.btnLimparFiltros) {
        elementos.btnLimparFiltros.addEventListener('click', () => {
            if (elementos.filtroDataInicio) elementos.filtroDataInicio.value = '';
            if (elementos.filtroDataFim) elementos.filtroDataFim.value = '';
            if (elementos.filtroStatus) elementos.filtroStatus.value = '';
            if (elementos.filtroGeral) elementos.filtroGeral.value = '';
            loadRecebimentos(true);
        });
    }

    if (elementos.btnCarregarMais) {
        elementos.btnCarregarMais.addEventListener('click', () => {
            loadRecebimentos(false);
        });
    }

    loadRecebimentos(true);
}