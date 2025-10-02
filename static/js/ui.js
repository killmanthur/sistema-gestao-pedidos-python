// static/js/ui.js
import { db } from './firebase.js';
import { AppState } from './state.js';
import { showToast } from './toasts.js';

/**
 * Alterna o estado de carregamento de um botão.
 * @param {HTMLButtonElement} button - O elemento do botão a ser modificado.
 * @param {boolean} isLoading - `true` para ativar o estado de carregamento, `false` para reverter.
 * @param {string} originalText - O texto original do botão.
 */
export function toggleButtonLoading(button, isLoading, originalText = 'Salvar') {
    if (!button) return;
    if (isLoading) {
        button.disabled = true;
        button.classList.add('loading');
        button.textContent = 'Salvando...';
    } else {
        button.disabled = false;
        button.classList.remove('loading');
        button.textContent = originalText;
    }
}

/**
 * Formata uma string de data para o formato localizado (dd/mm/aaaa hh:mm).
 * @param {string} dataString - A string de data a ser formatada.
 * @returns {string} A string de data formatada ou 'N/A' / 'Data inválida'.
 */
export function formatarData(dataString) {
    if (!dataString) return 'N/A';
    const cleanDateString = dataString.split('.')[0];
    const date = new Date(cleanDateString);
    if (isNaN(date.getTime())) return 'Data inválida';
    return date.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// =========================================================================
// CORREÇÃO AQUI: Adiciona a palavra 'export' para que a função seja visível
// =========================================================================
/**
 * Adiciona listeners de evento a todos os elementos que fecham modais.
 * Isso inclui botões 'X' e o clique no fundo escuro (overlay).
 */
export function setupAllModalCloseHandlers() {
    // Encontra todos os overlays de modal
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            // Fecha o modal apenas se o clique for no próprio overlay (fundo)
            if (e.target === overlay) {
                overlay.style.display = 'none';
            }
        });
    });

    // Encontra todos os botões de fechar pela classe '.close-modal'
    document.querySelectorAll('.close-modal').forEach(button => {
        button.addEventListener('click', () => {
            // Encontra o overlay pai mais próximo e o esconde
            const overlay = button.closest('.modal-overlay');
            if (overlay) {
                overlay.style.display = 'none';
            }
        });
    });
}

// --- Funções Principais da Interface do Usuário (UI) ---

/**
 * Inicializa a funcionalidade de alternância de tema com base nas preferências salvas.
 */
export function initializeTheme() {
    const themeToggle = document.getElementById('theme-toggle');
    if (!themeToggle) return;

    const savedTheme = localStorage.getItem('theme') || 'light';
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
    }

    document.getElementById('theme-icon-sun').style.display = (savedTheme === 'dark') ? 'none' : 'block';
    document.getElementById('theme-icon-moon').style.display = (savedTheme === 'dark') ? 'block' : 'none';

    if (!themeToggle.hasAttribute('data-listener-attached')) {
        themeToggle.addEventListener('click', () => {
            const isDarkMode = document.body.classList.toggle('dark-mode');
            const theme = isDarkMode ? 'dark' : 'light';
            localStorage.setItem('theme', theme);
            document.getElementById('theme-icon-sun').style.display = isDarkMode ? 'none' : 'block';
            document.getElementById('theme-icon-moon').style.display = isDarkMode ? 'block' : 'none';
        });
        themeToggle.setAttribute('data-listener-attached', 'true');
    }
}

/**
 * Configura os elementos da UI com base no estado de login do usuário atual.
 */
export function setupUI() {
    const mainNav = document.getElementById('main-nav');
    const navContainer = document.querySelector('.header__nav');

    if (!mainNav || !navContainer) {
        console.error("Elementos da navegação não encontrados.");
        return;
    }

    const user = AppState.currentUser;
    // Seleciona TODOS os itens, incluindo os que estão dentro dos dropdowns
    const navItems = mainNav.querySelectorAll('.nav-item');
    const logoutItem = document.getElementById('li-logout'); // Seleciona pelo ID

    if (user && user.isLoggedIn) {
        // Remove a classe do body, não precisamos mais dela para isso
        document.body.classList.remove('user-logged-in');

        navItems.forEach(item => {
            const pageKey = item.dataset.page;
            if (pageKey) { // Garante que só vamos avaliar itens com data-page
                const canAccess = user.role === 'Admin' || (user.accessible_pages && user.accessible_pages.includes(pageKey));
                item.style.display = canAccess ? 'list-item' : 'none';
            }
        });

        // Controla a visibilidade dos menus dropdown
        mainNav.querySelectorAll('.nav-item--dropdown').forEach(dropdown => {
            // Se houver pelo menos um item visível dentro do dropdown, mostra o dropdown inteiro
            const hasVisibleItem = dropdown.querySelector('.dropdown-menu .nav-item[style*="display: list-item"]');
            dropdown.style.display = hasVisibleItem ? 'list-item' : 'none';
        });

        // CORREÇÃO: Controla o botão Sair aqui
        if (logoutItem) logoutItem.style.display = 'list-item';

    } else {
        navItems.forEach(item => {
            item.style.display = 'none';
        });
        if (logoutItem) logoutItem.style.display = 'none';
    }

    navContainer.style.visibility = 'visible';
    navContainer.style.display = 'block';
}


// --- Funções do Modal de Histórico/Log ---

/**
 * Formata uma ação de log e seus detalhes em uma string HTML para exibição.
 * @param {string} acao - A ação realizada.
 * @param {object} detalhes - Detalhes associados à ação.
 * @returns {string} String HTML formatada para a entrada do log.
 */
function formatarLogAcao(acao, detalhes) {
    let acaoFormatada = `<span class="log-action">${acao.replace('_', ' ')}</span>`;

    if (detalhes) {
        if (detalhes.de && detalhes.para) {
            acaoFormatada += `: <span class="log-detail">"${detalhes.de}"</span> → <span class="log-detail">"${detalhes.para}"</span>`;
        } else if (detalhes.tipo) {
            acaoFormatada += `: <span class="log-detail">${detalhes.tipo}</span>`;
        } else if (detalhes.info) {
            acaoFormatada += `: <span class="log-detail">${detalhes.info}</span>`;
        } else if (detalhes.adicionado || detalhes.removido) {
            let detailsHTML = '<ul>';
            if (detalhes.adicionado) {
                detalhes.adicionado.forEach(item => {
                    detailsHTML += `<li><span style="color: var(--status-green);">+ Adicionado:</span> ${item}</li>`;
                });
            }
            if (detalhes.removido) {
                detalhes.removido.forEach(item => {
                    detailsHTML += `<li><span style="color: var(--status-red);">- Removido:</span> ${item}</li>`;
                });
            }
            detailsHTML += '</ul>';
            return acaoFormatada + detailsHTML;
        }
    }
    return acaoFormatada;
}

/**
 * Abre o modal de log e exibe o histórico para um determinado item.
 * @param {string} itemId - O ID do item (pedido, separação, etc.).
 * @param {string} logType - O tipo de log a ser buscado ('pedidos' ou 'separacoes').
 */
export async function openLogModal(itemId, logType = 'pedidos') {
    const modalOverlay = document.getElementById('log-modal-overlay');
    const logBody = document.getElementById('log-body');
    const logTitle = document.getElementById('log-modal-title');
    if (!modalOverlay || !logBody) return;

    modalOverlay.style.display = 'flex';
    logBody.innerHTML = '<p>Carregando histórico...</p>';
    logTitle.textContent = logType === 'separacoes' ? 'Histórico da Separação' : 'Histórico do Pedido';

    try {
        const logPath = logType === 'separacoes' ? `logs_separacoes/${itemId}` : `logs/${itemId}`;
        const logRef = db.ref(logPath).orderByChild('timestamp');
        const snapshot = await logRef.once('value');

        if (!snapshot.exists()) {
            logBody.innerHTML = `<p>Nenhum histórico de eventos para este item.</p>`;
            return;
        }

        const logs = [];
        snapshot.forEach(child => {
            logs.push(child.val());
        });
        logs.reverse();

        let logHTML = '<ul>';
        logs.forEach(log => {
            logHTML += `
                <li>
                    <div class="log-entry-header">
                        <span class="log-author">${log.autor}</span>
                        <span class="log-timestamp">${formatarData(log.timestamp)}</span>
                    </div>
                    <div class="log-entry-body">${formatarLogAcao(log.acao, log.detalhes)}</div>
                </li>`;
        });
        logHTML += '</ul>';
        logBody.innerHTML = logHTML;
    } catch (error) {
        console.error('Erro ao buscar histórico:', error);
        showToast('Não foi possível carregar o histórico.', 'error');
    }
}

/**
 * Configura os event listeners para fechar o modal de log.
 */
export function setupLogModal() {
    const modalOverlay = document.getElementById('log-modal-overlay');
    if (!modalOverlay) return;
    // CORREÇÃO: Lógica de fechamento removida. Agora é centralizada.
}

// --- Função do Modal de Confirmação ---

/**
 * Exibe um modal de confirmação com uma mensagem e um callback para confirmação.
 * @param {string} message - A mensagem a ser exibida no modal de confirmação.
 * @param {function} onConfirm - A função de callback a ser executada se confirmado.
 */
export function showConfirmModal(message, onConfirm) {
    const modalOverlay = document.getElementById('confirm-modal-overlay');
    const messageEl = document.getElementById('confirm-modal-message');
    const btnConfirm = document.getElementById('btn-do-confirm');
    const btnCancel = document.getElementById('btn-cancel-confirm');

    if (!modalOverlay || !messageEl || !btnConfirm || !btnCancel) return;

    messageEl.textContent = message;
    modalOverlay.style.display = 'flex';

    const closeModal = () => {
        modalOverlay.style.display = 'none';
        btnConfirm.onclick = null;
        btnCancel.onclick = null;
    };

    btnConfirm.onclick = () => {
        onConfirm();
        closeModal();
    };

    btnCancel.onclick = closeModal;
    // CORREÇÃO: A lógica para o botão X já foi removida daqui e está correta.
}

// --- Funções de Ação do Card ---

/**
 * Atualiza o status de um determinado pedido.
 * @param {string} pedidoId - O ID do pedido a ser atualizado.
 * @param {string} novoStatus - O novo status a ser definido para o pedido.
 */
async function atualizarStatus(pedidoId, novoStatus) {
    const dadosUpdate = {
        status: novoStatus,
        editor_nome: AppState.currentUser.nome,
    };

    try {
        const response = await fetch(`/api/pedidos/${pedidoId}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dadosUpdate)
        });

        if (response.ok) {
            showToast('Status atualizado com sucesso!', 'success');
        } else {
            const errorData = await response.json();
            showToast(`Não foi possível atualizar o status: ${errorData.message}`, 'error');
        }
    } catch (error) {
        console.error('Erro ao atualizar status:', error);
        showToast('Erro de conexão ao tentar atualizar o status.', 'error');
    }
}

/**
 * Atribui ou atualiza o comprador para um determinado pedido.
 * @param {string} pedidoId - O ID do pedido a ser atualizado.
 * @param {string} nomeComprador - O nome do comprador a ser atribuído.
 */
async function atualizarComprador(pedidoId, nomeComprador) {
    if (!nomeComprador) {
        return;
    }

    const dadosUpdate = {
        comprador: nomeComprador,
        editor_nome: AppState.currentUser.nome,
    };

    try {
        const response = await fetch(`/api/pedidos/${pedidoId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dadosUpdate)
        });

        if (response.ok) {
            showToast('Comprador atribuído com sucesso!', 'success');
        } else {
            const errorData = await response.json();
            showToast(`Não foi possível atribuir o comprador: ${errorData.message}`, 'error');
        }
    } catch (error) {
        console.error('Erro ao atribuir comprador:', error);
        showToast('Erro de conexão ao tentar atribuir o comprador.', 'error');
    }
}

/**
 * Exclui um determinado pedido após a confirmação do usuário.
 * @param {string} pedidoId - O ID do pedido a ser excluído.
 */
async function excluirPedido(pedidoId) {
    showConfirmModal('Tem certeza que deseja excluir este pedido? Esta ação é irreversível.', async () => {
        try {
            const response = await fetch(`/api/pedidos/${pedidoId}`, { method: 'DELETE' });
            if (!response.ok) {
                const errorData = await response.json();
                showToast(`Não foi possível excluir: ${errorData.message}`, 'error');
            } else {
                showToast('Pedido excluído com sucesso.', 'success');
                document.querySelector(`.pedido-card[data-id="${pedidoId}"]`)?.remove();
            }
        } catch (error) {
            showToast('Erro de conexão ao tentar excluir o pedido.', 'error');
        }
    });
}

// --- Função Principal de Criação de Card ---

/**
 * Cria e retorna um elemento HTML que representa um card de pedido.
 * @param {object} pedido - O objeto do pedido contendo todos os seus detalhes.
 * @returns {HTMLElement} O elemento do card de pedido criado.
 */
export function criarCardPedido(pedido) {
    const isAdmin = AppState.currentUser.role === 'Admin';
    // =========================================================================
    // MUDANÇA 1: Adicionamos uma verificação explícita para o Comprador
    // =========================================================================
    const isComprador = AppState.currentUser.role === 'Comprador';
    const isOwner = pedido.vendedor === AppState.currentUser.nome;

    const canEdit = isAdmin || isOwner || isComprador;
    const canManage = isAdmin || isComprador;

    const card = document.createElement('div');
    card.className = 'card pedido-card';
    card.dataset.id = pedido.id;

    if (pedido.status === 'Aguardando') card.classList.add('card--status-awaiting');
    else if (pedido.status === 'Em Cotação') card.classList.add('card--status-progress');
    else if (pedido.status === 'OK') card.classList.add('card--status-done');

    let compradorOptions = '<option value="">- Atribuir -</option>';
    (AppState.compradorNomes || []).forEach(c => {
        compradorOptions += `<option value="${c}" ${pedido.comprador === c ? 'selected' : ''}>${c}</option>`;
    });

    const logBtnHTML = `<button class="btn-icon" title="Ver Histórico"><img src="/static/history.svg" alt="Histórico"></button>`;

    // =========================================================================
    // MUDANÇA 2: A lógica para mostrar o botão agora inclui 'isComprador'
    // =========================================================================
    const deleteBtn = (isAdmin || isComprador) ? `<button class="btn btn--danger" title="Excluir Pedido">Excluir</button>` : '';

    let footerContent = '';
    if (pedido.status !== 'OK') {
        const editBtnHTML = canEdit ? `<button class="btn btn--edit">Editar</button>` : '';
        const statusActionsHTML = canManage ? `<button class="btn btn--warning">Em Cotação</button><button class="btn btn--success">OK</button>` : '';
        const selectHTML = canManage ? `<div class="comprador-select-wrapper"><label>Comprador:</label><select>${compradorOptions}</select></div>` : '';

        footerContent = `
            <p>Status: <span class="status-value">${pedido.status}</span></p>
            <div class="card__actions">${editBtnHTML}${statusActionsHTML}</div>
            ${selectHTML}
        `;
    } else {
        footerContent = `<div class="finalizado-badge">Finalizado</div>`;
    }

    let cardBodyContent = `
        <p><strong>Criação:</strong> ${formatarData(pedido.data_criacao)}</p>
        ${pedido.status === 'OK' ? `<p><strong>Finalização:</strong> ${formatarData(pedido.data_finalizacao)}</p>` : ''}
        <p><strong>Vendedor:</strong> ${pedido.vendedor}</p>
    `;

    if (pedido.itens) { // Pedido de Produto
        let itensHTML = '<ul style="list-style: none; padding-left: 0;">';
        (pedido.itens || []).forEach(item => {
            itensHTML += `<li><strong>${item.quantidade}x</strong> ${item.codigo}</li>`;
        });
        itensHTML += '</ul>';
        cardBodyContent += itensHTML;
    } else { // Atualização de Orçamento
        cardBodyContent += `<p><strong>Nº Orçamento:</strong> ${pedido.codigo || pedido.código}</p>`;
    }

    const observacao = pedido.observacao_geral || pedido.descricao;
    if (observacao) {
        cardBodyContent += `<p><strong>Obs:</strong> ${observacao}</p>`;
    }

    cardBodyContent += `<p><strong>Comprador:</strong> ${pedido.comprador || 'Não atribuído'}</p>`;

    card.innerHTML = `
        <div class="card__header">
            <h3>${pedido.tipo_req}</h3>
            <div class="card__header-actions">
                ${logBtnHTML}
                ${deleteBtn}
            </div>
        </div>
        <div class="card__body">${cardBodyContent}</div>
        <div class="card__footer">${footerContent}</div>`;

    // Adiciona os listeners de evento
    if (pedido.status !== 'OK') {
        if (canEdit) card.querySelector('.btn--edit')?.addEventListener('click', () => openEditModal(pedido));
        if (canManage) {
            card.querySelector('.btn--warning')?.addEventListener('click', () => atualizarStatus(pedido.id, 'Em Cotação'));
            card.querySelector('.btn--success')?.addEventListener('click', () => atualizarStatus(pedido.id, 'OK'));
            card.querySelector('.comprador-select-wrapper select')?.addEventListener('change', (e) => atualizarComprador(pedido.id, e.target.value));
        }
    }

    // =========================================================================
    // MUDANÇA 3: A lógica para anexar o evento de clique também inclui 'isComprador'
    // =========================================================================
    if (isAdmin || isComprador) {
        card.querySelector('.btn--danger')?.addEventListener('click', () => excluirPedido(pedido.id));
    }
    card.querySelector('.btn-icon')?.addEventListener('click', () => openLogModal(pedido.id, 'pedidos'));

    return card;
}


// --- Funções do Modal de Edição ---

/**
 * Abre o modal de edição e preenche-o com os dados do pedido.
 * @param {object} pedido - O objeto do pedido a ser editado.
 */
function openEditModal(pedido) {
    const modalOverlay = document.getElementById('edit-modal-overlay');
    const modal = document.getElementById('edit-modal');
    const modalTitle = document.getElementById('edit-modal-title');
    const form = document.getElementById('form-edit');

    modalTitle.textContent = `Editar ${pedido.tipo_req}`;
    form.innerHTML = '';

    modal.dataset.pedidoId = pedido.id;
    modal.dataset.pedidoTipo = pedido.tipo_req;

    if (pedido.itens) {
        let itensHTML = '<div id="edit-itens-container">';
        (pedido.itens || []).forEach((item, index) => {
            itensHTML += createModalItemRowHTML(index + 1, item.codigo, item.quantidade);
        });
        itensHTML += '</div>';

        form.innerHTML = `
            ${itensHTML}
            <div class="form-group">
                <button type="button" id="btn-add-edit-item" class="btn btn--secondary" style="width:100%;">+ Adicionar outro item</button>
            </div>
            <hr>
            <div class="form-group">
                <label for="edit-observacao-geral">Observação Geral</label>
                <textarea id="edit-observacao-geral" rows="3">${pedido.observacao_geral || ''}</textarea>
            </div>
        `;
        // =========================================================================

        form.querySelectorAll('.close-modal').forEach(btn => { // <-- Mudado de .remove-item-btn para .close-modal
            btn.onclick = () => btn.closest('.item-row').remove();
        });
        form.querySelector('#btn-add-edit-item').onclick = () => {
            const container = document.getElementById('edit-itens-container');
            const newItemIndex = container.children.length + 1;
            container.insertAdjacentHTML('beforeend', createModalItemRowHTML(newItemIndex));
            container.lastElementChild.querySelector('.close-modal').onclick = (e) => e.target.closest('.item-row').remove(); // <-- Mudado aqui também
        };

    } else {
        const codigoOrcamento = pedido.código || pedido.codigo;
        // =========================================================================
        // E CORREÇÃO AQUI TAMBÉM
        // =========================================================================
        form.innerHTML = `
            <div class="form-group">
                <label for="edit-orcamento-nome">Número do Orçamento</label>
                <input type="text" id="edit-orcamento-nome" value="${codigoOrcamento || ''}" required>
            </div>
            <div class="form-group">
                <label for="edit-observacao">Observação</label>
                <textarea id="edit-observacao" rows="4">${pedido.descricao || ''}</textarea>
            </div>
        `;
        // =========================================================================
    }

    modalOverlay.style.display = 'flex';

    setTimeout(() => {
        const firstInput = document.querySelector('#form-edit input, #form-edit textarea');
        if (firstInput) firstInput.focus();
    }, 100);
}

/**
 * Cria a string HTML para uma linha de item no modal de edição.
 * @param {number} index - O índice do item.
 * @param {string} [codigo=''] - O código do item.
 * @param {number} [quantidade=1] - A quantidade do item.
 * @returns {string} A string HTML para a linha do item.
 */
function createModalItemRowHTML(index, codigo = '', quantidade = 1) {
    // =========================================================================
    // CORREÇÃO PRINCIPAL AQUI
    // =========================================================================
    return `
        <div class="item-row">
            <div class="item-row-header">
                <h4>Item ${index}</h4>
                <button type="button" class="close-modal" title="Remover Item">×</button>
            </div>
            <div class="item-row-fields">
                <div class="form-group" style="flex-grow: 1;">
                    <label>Código</label>
                    <input type="text" class="item-codigo" value="${codigo}" required>
                </div>
                <div class="form-group" style="width: 80px;">
                    <label>Qtd</label>
                    <input type="number" class="item-quantidade" value="${quantidade}" required min="1">
                </div>
            </div>
        </div>
    `;

}

/**
 * Configura os event listeners para o modal de edição.
 */
export function setupEditModal() {
    const modalOverlay = document.getElementById('edit-modal-overlay');
    const btnCancel = document.getElementById('btn-cancel-edit');
    const form = document.getElementById('form-edit');
    const saveBtn = document.getElementById('btn-save-edit');

    if (!modalOverlay) return;

    const closeModal = () => { modalOverlay.style.display = 'none'; };

    // O botão 'Cancelar' fecha o modal
    btnCancel.onclick = closeModal;

    // CORREÇÃO: A lógica para o botão X e para o clique no overlay foi removida,
    // pois agora é gerenciada pela função global setupAllModalCloseHandlers.

    form.onsubmit = async (e) => {
        e.preventDefault();
        toggleButtonLoading(saveBtn, true, 'Salvar Alterações');

        const modal = document.getElementById('edit-modal');
        const pedidoId = modal.dataset.pedidoId;
        const pedidoTipo = modal.dataset.pedidoTipo;

        let updateData = {};

        if (pedidoTipo === 'Pedido Produto') {
            const itens = [];
            let hasError = false;
            form.querySelectorAll('#edit-itens-container .item-row').forEach(row => {
                const codigo = row.querySelector('.item-codigo').value.trim();
                const quantidade = row.querySelector('.item-quantidade').value;
                if (codigo && quantidade) {
                    itens.push({ codigo, quantidade });
                } else {
                    hasError = true;
                }
            });

            if (hasError || itens.length === 0) {
                showToast('Preencha todos os campos dos itens ou remova os itens vazios.', 'error');
                toggleButtonLoading(saveBtn, false, 'Salvar Alterações');
                return;
            }

            updateData.itens = itens;
            updateData.observacao_geral = document.getElementById('edit-observacao-geral').value;
        } else {
            updateData['código'] = document.getElementById('edit-orcamento-nome').value;
            updateData.descricao = document.getElementById('edit-observacao').value;
        }

        updateData.editor_nome = AppState.currentUser.nome;

        try {
            const response = await fetch(`/api/pedidos/${pedidoId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updateData),
            });
            if (response.ok) {
                closeModal();
                showToast('Pedido salvo com sucesso!', 'success');
            } else {
                showToast('Falha ao salvar as alterações.', 'error');
            }
        } catch (error) {
            showToast('Erro de conexão ao tentar salvar.', 'error');
        } finally {
            toggleButtonLoading(saveBtn, false, 'Salvar Alterações');
        }
    };
}
