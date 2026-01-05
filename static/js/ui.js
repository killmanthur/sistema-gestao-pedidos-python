// static/js/ui.js

import { AppState } from './state.js';
import { showToast } from './toasts.js';
import { pedidosAPI } from './apiClient.js';

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

export function initializeTheme() {
    const themeToggle = document.getElementById('theme-toggle');
    if (!themeToggle) return;

    // A classe dark-mode já foi aplicada pelo script no head
    const isDark = document.documentElement.classList.contains('dark-mode');
    if (isDark) document.body.classList.add('dark-mode'); // Sincroniza body se necessário

    document.getElementById('theme-icon-sun').style.display = isDark ? 'none' : 'block';
    document.getElementById('theme-icon-moon').style.display = isDark ? 'block' : 'none';

    themeToggle.onclick = () => {
        const isDarkMode = document.documentElement.classList.toggle('dark-mode');
        document.body.classList.toggle('dark-mode', isDarkMode);
        const theme = isDarkMode ? 'dark' : 'light';
        localStorage.setItem('theme', theme);
        document.getElementById('theme-icon-sun').style.display = isDarkMode ? 'none' : 'block';
        document.getElementById('theme-icon-moon').style.display = isDarkMode ? 'block' : 'none';
    };
}

export function setupUI() {
    const mainNav = document.getElementById('main-nav');
    const navContainer = document.querySelector('.header__nav');

    if (!mainNav || !navContainer) {
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

// ... (Funções de Log mantidas iguais, resumidas aqui para economizar espaço) ...
function formatarLogAcao(acao, detalhes) {
    let acaoFormatada = `<strong class="log-action">${acao.replace(/_/g, ' ')}</strong>`;
    if (!detalhes || Object.keys(detalhes).length === 0) return acaoFormatada;

    let detalhesHtml = '<ul>';
    let hasDetails = false;

    for (const [key, value] of Object.entries(detalhes)) {
        if (value && typeof value === 'object' && 'de' in value && 'para' in value) {
            hasDetails = true;
            const keyFormatted = key.replace(/_/g, ' ');
            const de_val = Array.isArray(value.de) ? (value.de.length > 0 ? value.de.join(', ') : 'Nenhum') : (value.de || 'N/A');
            const para_val = Array.isArray(value.para) ? (value.para.length > 0 ? value.para.join(', ') : 'Nenhum') : (value.para || 'N/A');
            detalhesHtml += `<li><strong>${keyFormatted}:</strong> <span class="log-detail-change">"${de_val}"</span> → <span class="log-detail-change">"${para_val}"</span></li>`;
        }
    }
    // ... (Resto da lógica de formatação de log) ...
    if (detalhes.info) { hasDetails = true; detalhesHtml += `<li><span class="log-detail-info">${detalhes.info}</span></li>`; }

    detalhesHtml += '</ul>';
    return hasDetails ? acaoFormatada + detalhesHtml : acaoFormatada;
}

export async function openLogModal(itemId, logType = 'pedidos') {
    const modalOverlay = document.getElementById('log-modal-overlay');
    if (!modalOverlay) return;

    modalOverlay.style.display = 'flex';
    const logBody = document.getElementById('log-body');
    const logTitle = document.getElementById('log-modal-title');
    logBody.innerHTML = '<div class="spinner" style="margin: 2rem auto;"></div>';
    logTitle.textContent = `Histórico (${logType.charAt(0).toUpperCase() + logType.slice(1)})`;

    try {
        const response = await fetch(`/api/logs/${logType}/${itemId}`);
        if (!response.ok) throw new Error('Falha ao buscar o histórico.');
        const logs = await response.json();

        if (logs.length === 0) {
            logBody.innerHTML = '<p>Nenhuma atividade registrada para este item.</p>';
            return;
        }

        logBody.innerHTML = logs.map(log => `
            <div class="log-entry">
                <div class="log-entry__meta">
                    <span class="log-entry__author">${log.autor || 'Sistema'}</span>
                    <span class="log-entry__timestamp">${formatarData(log.timestamp)}</span>
                </div>
                <div class="log-entry__action">
                    ${formatarLogAcao(log.acao, log.detalhes)}
                </div>
            </div>
        `).join('');

    } catch (error) {
        console.error('Erro ao buscar histórico:', error);
        logBody.innerHTML = `<p style="color: var(--clr-danger);">Não foi possível carregar o histórico.</p>`;
    }
}

export function setupLogModal() { }

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

// --- Lógica Principal de Atualização de Status ---

async function atualizarStatus(pedidoId, novoStatus) {
    let comprador = null;
    const cardElement = document.querySelector(`.pedido-card[data-id="${pedidoId}"]`);
    if (cardElement) {
        const compradorSelect = cardElement.querySelector('.comprador-select-wrapper select');
        if (compradorSelect && compradorSelect.value) {
            comprador = compradorSelect.value;
        }
    }

    try {
        // --- INÍCIO DA MUDANÇA ---
        // A chamada fetch foi substituída por nossa função do apiClient
        await pedidosAPI.updateStatus(pedidoId, novoStatus, comprador);
        // --- FIM DA MUDANÇA ---

        showToast('Status atualizado com sucesso!', 'success');

        // A lógica visual de atualizar o card permanece a mesma, pois o Socket.IO
        // irá disparar uma atualização completa do quadro de qualquer maneira.
        // Podemos simplificar isso no futuro, mas por enquanto, funciona.
        const isQuadroPage = window.location.pathname.includes('/quadro');
        const mantemNoQuadro = ['Aguardando', 'Em Cotação'].includes(novoStatus);
        if (isQuadroPage && mantemNoQuadro && cardElement) {
            const statusSpan = cardElement.querySelector('.status-value');
            if (statusSpan) statusSpan.textContent = novoStatus;
            cardElement.classList.remove('card--status-awaiting', 'card--status-progress');
            if (novoStatus === 'Aguardando') cardElement.classList.add('card--status-awaiting');
            else if (novoStatus === 'Em Cotação') cardElement.classList.add('card--status-progress');
        } else {
            cardElement?.remove();
            if (window.location.pathname.includes('/pedidos-a-caminho') && window.initPedidosACaminhoPage) {
                window.initPedidosACaminhoPage();
            }
        }
    } catch (error) {
        showToast(`Não foi possível atualizar: ${error.message}`, 'error');
    }
}

async function atualizarComprador(pedidoId, nomeComprador) {
    try {
        // --- INÍCIO DA MUDANÇA ---
        await pedidosAPI.updateComprador(pedidoId, nomeComprador);
        // --- FIM DA MUDANÇA ---

        showToast('Comprador atribuído!', 'success');
        const cardElement = document.querySelector(`.pedido-card[data-id="${pedidoId}"]`);
        if (cardElement) {
            const paragraphs = cardElement.querySelectorAll('.card__body p');
            paragraphs.forEach(p => {
                if (p.innerHTML.includes('<strong>Comprador:</strong>')) {
                    p.innerHTML = `<strong>Comprador:</strong> ${nomeComprador || 'Não atribuído'}`;
                    p.style.backgroundColor = '#e8f5e9';
                    setTimeout(() => { p.style.backgroundColor = 'transparent'; }, 500);
                }
            });
        }
    } catch (error) {
        showToast(`Falha ao atribuir: ${error.message}`, 'error');
    }
}

async function excluirPedido(pedidoId) {
    showConfirmModal('Mover este pedido para a lixeira? A ação pode ser revertida.', async () => {
        try {
            // --- INÍCIO DA MUDANÇA ---
            await pedidosAPI.delete(pedidoId);
            // --- FIM DA MUDANÇA ---

            showToast('Pedido movido para a lixeira.', 'success');
            document.querySelector(`.pedido-card[data-id="${pedidoId}"]`)?.remove();
        } catch (error) {
            showToast(`Não foi possível excluir: ${error.message || error}`, 'error');
        }
    });
}


// --- FUNÇÃO DE CRIAR CARD ---
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
    else if (pedido.status === 'A Caminho') card.classList.add('card--status-info');
    else if (pedido.status === 'OK') card.classList.add('card--status-done');

    let compradorOptions = '<option value="">- Atribuir -</option>';
    (AppState.compradorNomes || []).forEach(c => {
        compradorOptions += `<option value="${c}" ${pedido.comprador === c ? 'selected' : ''}>${c}</option>`;
    });

    const showFinalizeBtn = (isAdmin || isComprador) && pedido.status !== 'A Caminho' && pedido.status !== 'OK';
    const finalizeBtn = showFinalizeBtn ? `<button class="btn btn--success btn-finalize" title="Finalizar Pedido">✓</button>` : '';
    const logBtnHTML = `<button class="btn-icon" title="Ver Histórico"><img src="/static/history.svg" alt="Histórico"></button>`;
    const deleteBtn = (isAdmin || isComprador) ? `<button class="btn btn--danger" title="Excluir Pedido">Excluir</button>` : '';

    let footerContent = '';
    let editBtnHTML = '';

    const canEditACaminho = AppState.currentUser.permissions?.pode_editar_pedido_a_caminho;

    if (pedido.status !== 'A Caminho' && pedido.status !== 'OK' && canEdit) {
        editBtnHTML = `<button class="btn btn--edit">Editar</button>`;
    } else if (pedido.status === 'A Caminho' && canEditACaminho) {
        editBtnHTML = `<button class="btn btn--edit">Editar</button>`;
    }

    if (pedido.status === 'A Caminho') {
        footerContent = `
            <p>Status: <span class="status-value">${pedido.status}</span></p>
            <div class="card__actions">
                ${editBtnHTML}
                ${canManage ? '<button class="btn btn--success btn-marcar-chegada">Marcar Chegada</button>' : ''}
            </div>
        `;
    } else if (pedido.status !== 'OK') {
        // --- CORREÇÃO: Classes específicas para os botões ---
        const statusActionsHTML = canManage ? `
            <button class="btn btn--warning btn-status-cotacao">Em Cotação</button>
            <button class="btn btn--primary btn-status-efetuado">Pedido Efetuado</button> 
        ` : '';

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
                ${finalizeBtn}
            </div>
        </div>
        <div class="card__body">${cardBodyContent}</div>
        <div class="card__footer">${footerContent}</div>`;

    // --- Event Listeners ---

    card.querySelector('.btn-finalize')?.addEventListener('click', () => {
        // 1. Tenta pegar o comprador já salvo no pedido ou o valor selecionado no dropdown agora
        const selectComprador = card.querySelector('.comprador-select-wrapper select');
        const compradorSelecionado = selectComprador ? selectComprador.value : null;
        const temComprador = pedido.comprador || compradorSelecionado;

        // 2. Validação: Backend exige comprador para finalizar
        if (!temComprador) {
            showToast('É necessário atribuir um comprador antes de finalizar.', 'error');
            if (selectComprador) selectComprador.focus();
            return;
        }

        // 3. Confirmação e Envio
        showConfirmModal('Deseja finalizar este pedido diretamente? Ele irá para o histórico.', () => {
            // Se o usuário selecionou alguém no dropdown mas não salvou, a função atualizarStatus 
            // já cuida de enviar esse valor junto na requisição.
            atualizarStatus(pedido.id, 'OK');
        });
    });

    // Botão Editar
    card.querySelector('.btn--edit')?.addEventListener('click', () => openEditModal(pedido));

    // Ações de Status
    if (pedido.status === 'A Caminho' && canManage) {
        // --- INÍCIO DA ALTERAÇÃO ---
        card.querySelector('.btn-marcar-chegada')?.addEventListener('click', () => {
            showConfirmModal('Confirmar que este pedido chegou?', () => {
                atualizarStatus(pedido.id, 'OK');
            });
        });
        // --- FIM DA ALTERAÇÃO ---
    } else if (pedido.status !== 'OK' && canManage) {
        // Botão "Em Cotação"
        card.querySelector('.btn-status-cotacao')?.addEventListener('click', () => atualizarStatus(pedido.id, 'Em Cotação'));

        // Botão "Pedido Efetuado" (A Caminho)
        card.querySelector('.btn-status-efetuado')?.addEventListener('click', () => {
            // 1. Validação Local de Comprador (Executa antes da confirmação para poupar tempo)
            const select = card.querySelector('.comprador-select-wrapper select');

            if ((!select || !select.value) && !pedido.comprador) {
                showToast('Por favor, selecione um COMPRADOR antes de marcar como efetuado.', 'error');
                if (select) select.focus();
                return;
            }

            // 2. Se houver um comprador, pede a confirmação
            const compradorNome = select ? select.value : pedido.comprador;

            showConfirmModal(
                `Deseja marcar como EFETUADO? O pedido será movido para "Pedidos a Caminho"`,
                () => {
                    atualizarStatus(pedido.id, 'A Caminho');
                }
            );
        });

        // Select de Comprador
        card.querySelector('.comprador-select-wrapper select')?.addEventListener('change', (e) => atualizarComprador(pedido.id, e.target.value));
    }

    // Botão Excluir
    if (isAdmin || isComprador) {
        card.querySelector('.btn--danger')?.addEventListener('click', () => excluirPedido(pedido.id));
    }

    // Botão Log
    card.querySelector('.btn-icon')?.addEventListener('click', () => openLogModal(pedido.id, 'pedidos'));

    return card;
}

// ... (Funções openEditModal, createModalItemRowHTML e setupEditModal permanecem iguais) ...
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
                // Recarrega os dados da página atual
                if (window.location.pathname.includes('/quadro') && window.initQuadroPage) {
                    window.initQuadroPage();
                } else if (window.location.pathname.includes('/pedidos-a-caminho') && window.initPedidosACaminhoPage) {
                    window.initPedidosACaminhoPage();
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