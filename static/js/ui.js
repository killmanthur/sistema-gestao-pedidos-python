// static/js/ui.js

import { AppState } from './state.js';
import { showToast } from './toasts.js';
import { initQuadroPage } from './pages/quadro.js';

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

/**
 * Adiciona listeners de evento a todos os elementos que fecham modais.
 * Isso inclui botões 'X' e o clique no fundo escuro (overlay).
 */
export function setupAllModalCloseHandlers() {
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.style.display = 'none';
            }
        });
    });

    document.querySelectorAll('.close-modal').forEach(button => {
        button.addEventListener('click', () => {
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
    const navItems = mainNav.querySelectorAll('.nav-item');
    const logoutItem = document.getElementById('li-logout');

    if (user && user.isLoggedIn) {
        navItems.forEach(item => {
            if (item.classList.contains('nav-item--dropdown')) return;

            const pageKey = item.dataset.page;
            if (pageKey) {
                const canAccess = user.role === 'Admin' || (user.accessible_pages && user.accessible_pages.includes(pageKey));
                item.style.display = canAccess ? 'list-item' : 'none';
            }
        });

        mainNav.querySelectorAll('.nav-item--dropdown').forEach(dropdown => {
            const hasVisibleItem = dropdown.querySelector('.dropdown-menu .nav-item[style*="display: list-item"]');
            dropdown.style.display = hasVisibleItem ? 'list-item' : 'none';
        });

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

function formatarLogAcao(acao, detalhes) {
    let acaoFormatada = `<span class="log-action">${acao.replace(/_/g, ' ')}</span>`;

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
                    detailsHTML += `<li><span style="color: var(--clr-success);">+ Adicionado:</span> ${item}</li>`;
                });
            }
            if (detalhes.removido) {
                detalhes.removido.forEach(item => {
                    detailsHTML += `<li><span style="color: var(--clr-danger);">- Removido:</span> ${item}</li>`;
                });
            }
            detailsHTML += '</ul>';
            return acaoFormatada + detailsHTML;
        }
    }
    return acaoFormatada;
}

export async function openLogModal(itemId, logType = 'pedidos') {
    const modalOverlay = document.getElementById('log-modal-overlay');
    if (!modalOverlay) return;

    modalOverlay.style.display = 'flex';
    const logBody = document.getElementById('log-body');

    // --- INÍCIO DA CORREÇÃO ---
    // A lógica original dependia do Firebase. Vamos substituí-la por uma mensagem
    // temporária enquanto a API de logs não é criada no backend.
    logBody.innerHTML = `<p>A funcionalidade de histórico (log) está sendo migrada para o banco de dados local.</p>`;
    showToast('A visualização de logs será implementada na versão com banco local.', 'info');
    // --- FIM DA CORREÇÃO ---

    /* CÓDIGO ANTIGO COMENTADO:
    const logTitle = document.getElementById('log-modal-title');
    logBody.innerHTML = '<p>Carregando histórico...</p>';
    logTitle.textContent = `Histórico (${logType.charAt(0).toUpperCase() + logType.slice(1)})`;

    try {
        let logPath;
        // ... (lógica antiga com db.ref(...)) ...
    } catch (error) {
        console.error('Erro ao buscar histórico:', error);
        showToast('Não foi possível carregar o histórico.', 'error');
    }
    */
}

export function setupLogModal() {
    // A lógica de fechamento agora é gerenciada por setupAllModalCloseHandlers
}

// --- Função do Modal de Confirmação ---

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
}

// --- Funções de Ação do Card de Pedidos ---

async function atualizarStatus(pedidoId, novoStatus) {
    const dadosUpdate = {
        status: novoStatus,
        editor_nome: AppState.currentUser.nome,
    };

    // --- INÍCIO DA CORREÇÃO ---
    // Encontra o card específico pelo seu data-id
    const cardElement = document.querySelector(`.pedido-card[data-id="${pedidoId}"]`);
    if (cardElement) {
        // Encontra o select de comprador dentro daquele card
        const compradorSelect = cardElement.querySelector('.comprador-select-wrapper select');
        // Se o select existir, adiciona seu valor à requisição
        if (compradorSelect && compradorSelect.value) {
            dadosUpdate.comprador = compradorSelect.value;
        }
    }
    // --- FIM DA CORREÇÃO ---

    try {
        const response = await fetch(`/api/pedidos/${pedidoId}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dadosUpdate)
        });
        if (response.ok) {
            showToast('Status atualizado com sucesso!', 'success');
            // Recarrega os dados do quadro para refletir a mudança
            if (window.initQuadroPage) { // Verifica se a função existe para evitar erros em outras páginas
                window.initQuadroPage();
            }
        } else {
            const errorData = await response.json();
            showToast(`Não foi possível atualizar: ${errorData.message}`, 'error');
        }
    } catch (error) {
        showToast('Erro de conexão ao atualizar status.', 'error');
    }
}


async function atualizarComprador(pedidoId, nomeComprador) {
    if (!nomeComprador) return;
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
            showToast('Comprador atribuído!', 'success');
        } else {
            const errorData = await response.json();
            showToast(`Falha ao atribuir: ${errorData.message}`, 'error');
        }
    } catch (error) {
        showToast('Erro de conexão ao atribuir comprador.', 'error');
    }
}

async function excluirPedido(pedidoId) {
    showConfirmModal('Excluir este pedido? A ação é irreversível.', async () => {
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
            showToast('Erro de conexão ao tentar excluir.', 'error');
        }
    });
}

// --- Função Principal de Criação de Card ---

export function criarCardPedido(pedido) {
    const isAdmin = AppState.currentUser.role === 'Admin';
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

    if (pedido.itens) {
        let itensHTML = '<ul style="list-style: none; padding-left: 0;">';
        (pedido.itens || []).forEach(item => {
            itensHTML += `<li><strong>${item.quantidade}x</strong> ${item.codigo}</li>`;
        });
        itensHTML += '</ul>';
        cardBodyContent += itensHTML;
    } else {
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

    if (pedido.status !== 'OK') {
        if (canEdit) card.querySelector('.btn--edit')?.addEventListener('click', () => openEditModal(pedido));
        if (canManage) {
            card.querySelector('.btn--warning')?.addEventListener('click', () => atualizarStatus(pedido.id, 'Em Cotação'));
            card.querySelector('.btn--success')?.addEventListener('click', () => atualizarStatus(pedido.id, 'OK'));
            card.querySelector('.comprador-select-wrapper select')?.addEventListener('change', (e) => atualizarComprador(pedido.id, e.target.value));
        }
    }

    if (isAdmin || isComprador) {
        card.querySelector('.btn--danger')?.addEventListener('click', () => excluirPedido(pedido.id));
    }
    card.querySelector('.btn-icon')?.addEventListener('click', () => openLogModal(pedido.id, 'pedidos'));

    return card;
}


// --- Funções do Modal de Edição ---

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
                <button type="button" id="btn-add-edit-item" class="btn btn--secondary" style="width:100%;">+ Adicionar item</button>
            </div>
            <hr>
            <div class="form-group">
                <label for="edit-observacao-geral">Observação Geral</label>
                <textarea id="edit-observacao-geral" rows="3">${pedido.observacao_geral || ''}</textarea>
            </div>
        `;
        form.querySelectorAll('.close-modal').forEach(btn => {
            btn.onclick = () => btn.closest('.item-row').remove();
        });
        form.querySelector('#btn-add-edit-item').onclick = () => {
            const container = document.getElementById('edit-itens-container');
            const newItemIndex = container.children.length + 1;
            container.insertAdjacentHTML('beforeend', createModalItemRowHTML(newItemIndex));
            container.lastElementChild.querySelector('.close-modal').onclick = (e) => e.target.closest('.item-row').remove();
        };
    } else {
        const codigoOrcamento = pedido.código || pedido.codigo;
        form.innerHTML = `
            <div class="form-group">
                <label for="edit-orcamento-nome">Nº do Orçamento</label>
                <input type="text" id="edit-orcamento-nome" value="${codigoOrcamento || ''}" required>
            </div>
            <div class="form-group">
                <label for="edit-observacao">Observação</label>
                <textarea id="edit-observacao" rows="4">${pedido.descricao || ''}</textarea>
            </div>
        `;
    }

    modalOverlay.style.display = 'flex';
    setTimeout(() => {
        const firstInput = document.querySelector('#form-edit input, #form-edit textarea');
        if (firstInput) firstInput.focus();
    }, 100);
}

function createModalItemRowHTML(index, codigo = '', quantidade = 1) {
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

export function setupEditModal() {
    const modalOverlay = document.getElementById('edit-modal-overlay');
    const btnCancel = document.getElementById('btn-cancel-edit');
    const form = document.getElementById('form-edit');
    const saveBtn = document.getElementById('btn-save-edit');
    if (!modalOverlay || !btnCancel || !form || !saveBtn) return;

    const closeModal = () => { modalOverlay.style.display = 'none'; };
    btnCancel.onclick = closeModal;

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
                showToast('Preencha todos os campos ou remova itens vazios.', 'error');
                toggleButtonLoading(saveBtn, false, 'Salvar Alterações');
                return;
            }
            updateData.itens = itens;
            updateData.observacao_geral = document.getElementById('edit-observacao-geral').value;
        } else {
            updateData.codigo = document.getElementById('edit-orcamento-nome').value;
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
                if (window.location.pathname.includes('/quadro')) {
                    initQuadroPage();
                }
            } else {
                const errorData = await response.json();
                showToast(`Falha ao salvar: ${errorData.error || 'Erro'}`, 'error');
            }
        } catch (error) {
            showToast('Erro de conexão ao tentar salvar.', 'error');
        } finally {
            toggleButtonLoading(saveBtn, false, 'Salvar Alterações');
        }
    };
}