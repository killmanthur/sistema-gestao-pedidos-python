import { AppState } from '../state.js';
import { showToast } from '../toasts.js';
import { toggleButtonLoading, formatarData, showConfirmModal, openLogModal } from '../ui.js';

let state = {};
let intervalId = null;

const TAMANHO_PAGINA_RESOLVIDOS = 15;

function resetState() {
    state = {
        elementos: {},
        pend_fornecedor: [],
        pend_alteracao: [],
        todosOsResolvidos: [], // Guarda a lista completa
        paginaResolvidos: 0,
        temMaisResolvidos: true,
        carregandoResolvidos: false,
    };
}

async function handleSolicitarAlteracao(item) {
    const modal = state.elementos.solicitarAlteracaoModal;
    modal.form.reset(); // Limpa o formulário
    modal.form.dataset.id = item.id; // Armazena o ID no formulário
    modal.overlay.style.display = 'flex';
    setTimeout(() => modal.obsInput.focus(), 100);
}

async function handleSolicitarAlteracaoSubmit(event) {
    event.preventDefault();
    const modal = state.elementos.solicitarAlteracaoModal;
    const form = event.target;
    const id = form.dataset.id;
    const observacao = modal.obsInput.value.trim();
    const submitBtn = form.querySelector('button[type="submit"]');

    if (!observacao) {
        showToast('A observação é obrigatória.', 'error');
        return;
    }

    toggleButtonLoading(submitBtn, true, 'Enviando...');
    try {
        const response = await fetch(`/api/conferencias/${id}/solicitar-alteracao`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                editor_nome: AppState.currentUser.nome,
                observacao: observacao // Envia a observação
            })
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Falha ao solicitar alteração.');
        }
        showToast('Item enviado para revisão da Contabilidade!', 'success');
        modal.overlay.style.display = 'none';
    } catch (error) {
        showToast(`Erro: ${error.message}`, 'error');
    } finally {
        toggleButtonLoading(submitBtn, false, 'Confirmar Solicitação');
    }
}


function criarCardPendencia(item, tipoPendencia) {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.id = item.id;
    const perms = AppState.currentUser.permissions || {};

    let corBorda = 'danger';
    if (tipoPendencia === 'alteracao') corBorda = 'info';
    if (item.status === 'Finalizado') corBorda = 'done';
    card.classList.add(`card--status-${corBorda}`);

    let footerAction = '';
    const gestorPodeResolver = (['Admin', 'Estoque'].includes(AppState.currentUser.role)) && tipoPendencia === 'fornecedor';
    const contabilidadePodeResolver = (['Admin', 'Contabilidade'].includes(AppState.currentUser.role)) && tipoPendencia === 'alteracao';

    if (item.status !== 'Finalizado' && (gestorPodeResolver || contabilidadePodeResolver)) {
        footerAction = `<button class="btn btn--primary" data-action="resolver">Resolver</button>`;
    }

    let headerActions = `<button class="btn-icon" data-action="log" title="Ver Histórico"><img src="/static/history.svg" alt="Histórico"></button>`;
    if (perms.pode_editar_pendencia) {
        headerActions += `<button class="btn-icon" data-action="edit" title="Editar Informações da NF"><img src="/static/edit.svg" alt="Editar"></button>`;
    }

    if (item.status === 'Pendente (Fornecedor)' || item.status === 'Finalizado') {
        headerActions += `<button class="btn-icon" data-action="solicitar-alteracao" title="Solicitar Alteração para Contabilidade"><img src="/static/exclamacao.png" alt="Solicitar Alteração"></button>`;
    }

    if (perms.pode_deletar_conferencia) {
        headerActions += `<button class="btn-icon" data-action="delete" title="Excluir"><img src="/static/cancelar.png" alt="Excluir"></button>`;
    }

    let observacoesHTML = '';
    if (item.observacoes) {
        observacoesHTML = '<div class="obs-log-container">';
        Object.values(item.observacoes)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .forEach(obs => {
                observacoesHTML += `<div class="obs-entry"><strong>${obs.autor}:</strong> ${obs.texto}<small>${formatarData(obs.timestamp)}</small></div>`;
            });
        observacoesHTML += '</div>';
    }

    let finalizadoInfoHTML = '';
    if (item.status === 'Finalizado') {
        finalizadoInfoHTML = `
            <p><small><strong>Início Conf.:</strong> ${formatarData(item.data_inicio_conferencia)}</small></p>
            <p><small><strong>Fim Conf.:</strong> ${formatarData(item.data_finalizacao)}</small></p>
        `;
    }


    card.innerHTML = `
        <div class="card__header">
            <h3>NF: ${item.numero_nota_fiscal}</h3>
            <div class="card__header-actions">${headerActions}</div>
        </div>
        <div class="card__body">
            <p><strong>Fornecedor:</strong> ${item.nome_fornecedor}</p>
            <p><strong>Responsável:</strong> ${item.conferentes ? item.conferentes.join(', ') : 'N/A'}</p>
            ${observacoesHTML}
            ${finalizadoInfoHTML}
        </div>
        <div class="card__footer">
            <div class="card__actions">${footerAction}</div>
        </div>`;

    card.querySelector('[data-action="log"]')?.addEventListener('click', () => openLogModal(item.id, 'conferencias'));
    card.querySelector('[data-action="resolver"]')?.addEventListener('click', () => openResolverModal(item));
    card.querySelector('[data-action="edit"]')?.addEventListener('click', () => openEditModal(item));
    card.querySelector('[data-action="delete"]')?.addEventListener('click', () => handleDelete(item.id));
    card.querySelector('[data-action="solicitar-alteracao"]')?.addEventListener('click', () => handleSolicitarAlteracao(item));


    return card;
}

function renderizarColunas() {
    const termo = state.elementos.filtroInput.value.toLowerCase().trim();
    const filterFn = item => String(item.numero_nota_fiscal).toLowerCase().includes(termo) || String(item.nome_fornecedor).toLowerCase().includes(termo);

    const render = (container, data, tipoPendencia) => {
        container.innerHTML = '';
        const filtered = data.filter(filterFn);
        if (filtered.length > 0) {
            filtered.forEach(item => container.appendChild(criarCardPendencia(item, tipoPendencia)));
        } else {
            container.innerHTML = `<p class="quadro-vazio-msg">Nenhum item aqui.</p>`;
        }
    };

    if (state.elementos.quadroFornecedor) render(state.elementos.quadroFornecedor, state.pend_fornecedor, 'fornecedor');
    if (state.elementos.quadroAlteracao) render(state.elementos.quadroAlteracao, state.pend_alteracao, 'alteracao');
}

function renderizarPaginaResolvidos(itens) {
    const { quadroResolvidos } = state.elementos;
    const termo = state.elementos.filtroInput.value.toLowerCase().trim();
    const filterFn = item => String(item.numero_nota_fiscal).toLowerCase().includes(termo) || String(item.nome_fornecedor).toLowerCase().includes(termo);

    const itensFiltrados = itens.filter(filterFn);

    if (itensFiltrados.length > 0) {
        itensFiltrados.forEach(item => quadroResolvidos.appendChild(criarCardPendencia(item, 'finalizado')));
    }

    if (quadroResolvidos.children.length === 0) {
        quadroResolvidos.innerHTML = `<p class="quadro-vazio-msg">Nenhum item resolvido encontrado.</p>`;
    }
}

function carregarPaginaResolvidos() {
    if (state.carregandoResolvidos || !state.temMaisResolvidos) return;

    state.carregandoResolvidos = true;
    const { spinnerResolvidos, btnCarregarMais } = state.elementos.paginacaoResolvidos;
    spinnerResolvidos.style.display = 'block';
    btnCarregarMais.style.display = 'none';

    const offset = state.paginaResolvidos * TAMANHO_PAGINA_RESOLVIDOS;
    const itensDaPagina = state.todosOsResolvidos.slice(offset, offset + TAMANHO_PAGINA_RESOLVIDOS);

    renderizarPaginaResolvidos(itensDaPagina);

    state.paginaResolvidos++;
    state.temMaisResolvidos = (state.paginaResolvidos * TAMANHO_PAGINA_RESOLVIDOS) < state.todosOsResolvidos.length;

    spinnerResolvidos.style.display = 'none';
    btnCarregarMais.style.display = state.temMaisResolvidos ? 'block' : 'none';
    state.carregandoResolvidos = false;
}

function openResolverModal(item) {
    const modal = state.elementos.resolverModal;
    modal.form.dataset.id = item.id;
    modal.obsInput.value = '';
    const histContainer = modal.form.querySelector('#historico-observacoes');
    histContainer.innerHTML = '<h4>Histórico de Observações:</h4>';
    if (item.observacoes) {
        Object.values(item.observacoes).sort((a, b) => new Date(b.timestamp) - new Date(b.timestamp)).forEach(obs => {
            histContainer.innerHTML += `<div class="obs-entry"><small>${formatarData(obs.timestamp)} - <strong>${obs.autor}</strong></small><p>${obs.texto}</p></div>`;
        });
    } else {
        histContainer.innerHTML += '<p>Nenhuma observação ainda.</p>';
    }
    modal.overlay.style.display = 'flex';
}

async function handleAddUpdate() {
    const modal = state.elementos.resolverModal;
    const id = modal.form.dataset.id;
    const observacao = modal.obsInput.value;
    const btn = state.elementos.resolverModal.btnAddUpdate;

    if (!observacao.trim()) {
        showToast('A observação não pode estar vazia para adicionar uma atualização.', 'error');
        return;
    }

    toggleButtonLoading(btn, true, 'Adicionando...');
    try {
        // 1. Envia a nova observação para o backend (isso já estava funcionando)
        const responsePost = await fetch(`/api/conferencias/${id}/observacao`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                autor: AppState.currentUser.nome,
                texto: `[ATUALIZAÇÃO] ${observacao}`
            })
        });
        if (!responsePost.ok) throw new Error((await responsePost.json()).error || 'Falha ao salvar observação.');

        showToast('Atualização adicionada com sucesso!', 'success');
        modal.obsInput.value = '';

        // --- INÍCIO DA CORREÇÃO ---
        // 2. Busca os dados atualizados da nossa própria API
        const responseGet = await fetch(`/api/conferencias/${id}`);
        if (!responseGet.ok) throw new Error('Falha ao buscar dados atualizados.');

        const updatedItem = await responseGet.json();

        // 3. Reabre o modal com os dados frescos
        openResolverModal(updatedItem);
        // --- FIM DA CORREÇÃO ---

    } catch (error) {
        showToast(`Erro: ${error.message}`, 'error');
    } finally {
        toggleButtonLoading(btn, false, 'Adicionar Atualização');
    }
}

async function handleResolverSubmit(event) {
    event.preventDefault();
    const modal = state.elementos.resolverModal;
    const id = modal.form.dataset.id;
    const observacao = modal.obsInput.value;
    const btn = modal.form.querySelector('button[type="submit"]');

    if (!observacao.trim()) {
        showToast('A observação de resolução é obrigatória.', 'error');
        return;
    }

    toggleButtonLoading(btn, true, 'Resolvendo...');
    try {
        const response = await fetch(`/api/conferencias/${id}/resolver-item`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                editor_nome: AppState.currentUser.nome,
                user_role: AppState.currentUser.role,
                observacao: observacao
            })
        });
        if (!response.ok) throw new Error((await response.json()).error);
        showToast('Item resolvido com sucesso!', 'success');
        modal.overlay.style.display = 'none';
    } catch (error) {
        showToast(`Erro: ${error.message}`, 'error');
    } finally {
        toggleButtonLoading(btn, false, 'Marcar como Resolvido');
    }
}

function openEditModal(item) {
    const modal = state.elementos.editModal;
    modal.form.dataset.id = item.id;
    modal.form.querySelector('#edit-numero-nota-fiscal').value = item.numero_nota_fiscal;
    modal.form.querySelector('#edit-nome-fornecedor').value = item.nome_fornecedor;
    modal.form.querySelector('#edit-nome-transportadora').value = item.nome_transportadora;
    modal.form.querySelector('#edit-qtd-volumes').value = item.qtd_volumes;

    const perms = AppState.currentUser.permissions || {};
    modal.deleteButton.style.display = perms.pode_deletar_conferencia ? 'inline-block' : 'none';

    modal.overlay.style.display = 'flex';
}

async function handleEditFormSubmit(event) {
    event.preventDefault();
    const modal = state.elementos.editModal;
    const id = modal.form.dataset.id;
    const saveButton = modal.form.querySelector('button[type="submit"]');

    toggleButtonLoading(saveButton, true, 'Salvando...');
    const dados = {
        numero_nota_fiscal: document.getElementById('edit-numero-nota-fiscal').value,
        nome_fornecedor: document.getElementById('edit-nome-fornecedor').value,
        nome_transportadora: document.getElementById('edit-nome-transportadora').value,
        qtd_volumes: document.getElementById('edit-qtd-volumes').value,
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
    showConfirmModal('Tem certeza que deseja excluir esta conferência? Esta ação é irreversível.', async () => {
        try {
            const response = await fetch(`/api/conferencias/${id}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ editor_nome: AppState.currentUser.nome })
            });
            if (!response.ok) throw new Error((await response.json()).error);
            showToast('Conferência excluída com sucesso!', 'success');
        } catch (error) {
            showToast(`Erro ao excluir: ${error.message}`, 'error');
        }
    });
};

async function fetchData() {
    try {
        const response = await fetch('/api/conferencias/pendentes-e-resolvidas');
        if (!response.ok) throw new Error('Falha ao buscar dados de pendências.');

        const lista = await response.json();
        const userRole = AppState.currentUser.role;

        state.pend_fornecedor = lista.filter(c => ['Pendente (Fornecedor)', 'Pendente (Ambos)'].includes(c.status) && !c.resolvido_gestor);
        state.pend_alteracao = lista.filter(c => ['Pendente (Alteração)', 'Pendente (Ambos)'].includes(c.status) && !c.resolvido_contabilidade);
        state.todosOsResolvidos = lista.filter(c => c.status === 'Finalizado');

        state.paginaResolvidos = 0;
        state.temMaisResolvidos = true;
        state.elementos.quadroResolvidos.innerHTML = '';

        renderizarColunas();
        carregarPaginaResolvidos();

        const isAdmin = userRole === 'Admin';
        state.elementos.colunaFornecedor.style.display = (isAdmin || userRole === 'Estoque') ? 'block' : 'none';
        state.elementos.colunaAlteracao.style.display = (isAdmin || userRole === 'Estoque' || userRole === 'Contabilidade') ? 'block' : 'none';

    } catch (error) {
        console.error("Erro ao buscar dados de pendências:", error);
        showToast(error.message, 'error');
        if (intervalId) clearInterval(intervalId);
    }
}

export function initPendenciasEAlteracoesPage() {
    resetState();
    state.elementos = {
        filtroInput: document.getElementById('filtro-pendencias'),
        colunaFornecedor: document.getElementById('coluna-pendencia-fornecedor'),
        quadroFornecedor: document.getElementById('quadro-pendencia-fornecedor'),
        colunaAlteracao: document.getElementById('coluna-solicitacao-alteracao'),
        quadroAlteracao: document.getElementById('quadro-solicitacao-alteracao'),
        quadroResolvidos: document.getElementById('quadro-resolvidos'),
        paginacaoResolvidos: {
            container: document.getElementById('pagination-resolvidos'),
            spinnerResolvidos: document.getElementById('loading-spinner-resolvidos'),
            btnCarregarMais: document.getElementById('btn-carregar-mais-resolvidos'),
        },
        resolverModal: {
            overlay: document.getElementById('resolver-modal-overlay'),
            form: document.getElementById('form-resolver'),
            obsInput: document.getElementById('resolver-observacao'),
            btnAddUpdate: document.getElementById('btn-add-update'),
        },
        editModal: {
            overlay: document.getElementById('edit-recebimento-modal-overlay'),
            form: document.getElementById('form-edit-recebimento'),
            deleteButton: document.getElementById('btn-excluir-recebimento')
        },
        solicitarAlteracaoModal: {
            overlay: document.getElementById('solicitar-alteracao-modal-overlay'),
            form: document.getElementById('form-solicitar-alteracao'),
            obsInput: document.getElementById('solicitar-alteracao-observacao'),
        }
    };

    state.elementos.solicitarAlteracaoModal.form.addEventListener('submit', handleSolicitarAlteracaoSubmit);
    state.elementos.paginacaoResolvidos.btnCarregarMais.addEventListener('click', carregarPaginaResolvidos);
    state.elementos.filtroInput.addEventListener('input', () => {
        renderizarColunas();
        state.elementos.quadroResolvidos.innerHTML = '';
        state.paginaResolvidos = 0;
        state.temMaisResolvidos = true;
        carregarPaginaResolvidos();
    });

    state.elementos.resolverModal.form.addEventListener('submit', handleResolverSubmit);
    state.elementos.resolverModal.btnAddUpdate.addEventListener('click', handleAddUpdate);
    state.elementos.editModal.form.addEventListener('submit', handleEditFormSubmit);
    state.elementos.editModal.deleteButton.addEventListener('click', () => {
        const id = state.elementos.editModal.form.dataset.id;
        handleDelete(id);
    });

    if (intervalId) clearInterval(intervalId);

    const quadros = [
        state.elementos.quadroFornecedor,
        state.elementos.quadroAlteracao,
        state.elementos.quadroResolvidos
    ];
    quadros.forEach(q => { if (q) q.innerHTML = `<div class="spinner" style="margin: 2rem auto;"></div>`; });

    fetchData(); // Busca inicial
    intervalId = setInterval(fetchData, 20000); // Atualiza a cada 20 segundos
}