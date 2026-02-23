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
        await pedidosAPI.updateStatus(pedidoId, novoStatus, comprador);
        showToast('Status atualizado com sucesso!', 'success');

        const isQuadroPage = window.location.pathname.includes('/quadro');

        // --- CORREÇÃO AQUI: Incluímos 'Aguardando Aprovação' para não remover o card ---
        const mantemNoQuadro = ['Aguardando', 'Em Cotação', 'Aguardando Aprovação'].includes(novoStatus);

        if (isQuadroPage && mantemNoQuadro && cardElement) {
            const statusSpan = cardElement.querySelector('.status-value');
            if (statusSpan) statusSpan.textContent = novoStatus;

            // Remove classes antigas e adiciona a nova
            cardElement.classList.remove('card--status-awaiting', 'card--status-progress', 'card--status-approval');

            if (novoStatus === 'Aguardando') {
                cardElement.classList.add('card--status-awaiting');
            } else if (novoStatus === 'Em Cotação') {
                cardElement.classList.add('card--status-progress');
            } else if (novoStatus === 'Aguardando Aprovação') {
                cardElement.classList.add('card--status-approval'); // Aplica o estilo azul

                // Opcional: Esconder o botão de aprovação já que ele já está nesse status
                const btnApproval = cardElement.querySelector('.btn-approval');
                if (btnApproval) btnApproval.style.display = 'none';
            }
        } else {
            // Se for para 'A Caminho' ou 'OK', remove do quadro ativo
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

export function criarCardPedido(pedido) {
    const isAdmin = AppState.currentUser.role === 'Admin';
    const isComprador = AppState.currentUser.role === 'Comprador';
    const isOwner = pedido.vendedor === AppState.currentUser.nome;
    const canEdit = isAdmin || isOwner || isComprador;
    const canManage = isAdmin || isComprador;

    const card = document.createElement('div');
    card.className = 'card pedido-card';
    card.dataset.id = pedido.id;

    // --- Definição de Cores e Classes de Status ---
    let statusClass = '';
    if (pedido.status === 'Aguardando') {
        card.classList.add('card--status-awaiting');
        statusClass = 'bg-status-awaiting';
    } else if (pedido.status === 'Em Cotação') {
        card.classList.add('card--status-progress');
        statusClass = 'bg-status-progress';
    } else if (pedido.status === 'Aguardando Aprovação') {
        card.classList.add('card--status-approval');
        statusClass = 'status-approval';
    } else if (pedido.status === 'A Caminho') {
        card.classList.add('card--status-info');
        statusClass = 'status-approval'; 
    } else if (pedido.status === 'OK') {
        card.classList.add('card--status-done');
        statusClass = 'bg-status-success';
    }

    // --- Cabeçalho (Header) - Ações de Registro/Log ---
    const logBtnHTML = `<button class="btn-icon btn-log" data-tooltip="Ver Histórico"><img src="/static/history.svg" style="width:14px; opacity:0.5;"></button>`;
    const deleteBtn = (isAdmin || isComprador) ? `<button class="btn-delete-card" data-tooltip="Excluir Pedido">×</button>` : '';
    
    // Botão de Finalização Rápida (Mantido no topo para emergências, opcional)
    const finalizeBtn = (canManage && !['A Caminho', 'OK'].includes(pedido.status))
        ? `<button class="btn-icon btn-finalize-quick" data-tooltip="Finalizar pedido imediato" style="color:var(--clr-success); font-weight:bold;">✓</button>` : '';

    card.innerHTML = `
        <div class="card__header">
            <div style="display:flex; align-items:center; gap:8px; min-width:0; flex:1;">
                <span class="card-tipo-req">${pedido.tipo_req}</span>
                <span class="badge-status ${statusClass}">${pedido.status.toUpperCase()}</span>
            </div>
            <div class="card__header-actions">
                ${logBtnHTML}
                ${finalizeBtn}
                ${deleteBtn}
            </div>
        </div>
        <div class="card__body" style="padding: 12px;">
            <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:0.75rem; opacity:0.7;">
                <span>Vendedor: <strong>${pedido.vendedor}</strong></span>
                <span>${formatarData(pedido.data_criacao)}</span>
            </div>
            <div class="itens-lista">
                ${renderizarListaItens(pedido)}
            </div>
            ${pedido.observacao_geral || pedido.descricao ? `
            <p style="margin-top: 12px; font-size: 0.85rem; color: var(--text-secondary); line-height: 1.4; padding-top: 8px;">
            <strong style="color: var(--text-primary); font-size: 0.8rem; text-transform: uppercase;">Obs:</strong> 
            ${pedido.observacao_geral || pedido.descricao}
            </p>` : ''}
        </div>
        <div class="card__footer" style="padding: 8px 12px; background: rgba(0,0,0,0.03); border-top: 1px solid var(--border-main);">
            <div class="card__actions" style="display: flex; align-items: center; width: 100%; justify-content: flex-start; gap:8px;">
                <div class="footer-left" style="flex: 0 1 130px; min-width: 0;">
                    ${renderFooterComprador(pedido, canManage)}
                </div>
                <div class="footer-right" style="display: flex; gap: 4px; flex: 1; justify-content: flex-end; flex-wrap: wrap;">
                    ${renderFooterButtons(pedido, canManage, canEdit)}
                </div>
            </div>
        </div>
    `;

    adicionarListenersCard(card, pedido, canManage);
    return card;
}

// Auxiliar para renderizar o comprador no rodapé
function renderFooterComprador(pedido, canManage) {
    if (pedido.status === 'OK') {
        return `<span style="font-size:0.7rem; opacity:0.8; font-weight:500;">Comp: ${pedido.comprador || 'N/A'}</span>`;
    }
    if (canManage) {
        let options = '<option value="">- Comprador -</option>';
        (AppState.compradorNomes || []).forEach(c => {
            options += `<option value="${c}" ${pedido.comprador === c ? 'selected' : ''}>${c}</option>`;
        });
        return `<select class="select-compact comprador-select-realtime">${options}</select>`;
    }
    return `<span style="font-size:0.7rem; opacity:0.7;">Comp: ${pedido.comprador || 'N/A'}</span>`;
}

function renderizarListaItens(pedido) {
    if (pedido.itens && pedido.itens.length > 0) {
        let html = '<ul class="item-list-selectable" style="list-style:none; padding:0; margin:0;">';
        pedido.itens.forEach(item => {
            html += `<li style="font-size:0.9rem; margin-bottom:2px;">
                        <span style="color:var(--text-muted); margin-right:5px;">•</span>
                        <strong>${item.quantidade}x</strong> ${item.codigo}
                     </li>`;
        });
        return html + '</ul>';
    }
    return `<p style="font-size:0.9rem;"><strong>Orçamento:</strong> ${pedido.codigo || pedido.código}</p>`;
}

function renderFooterLeft(pedido, canManage) {
    if (pedido.status === 'OK') {
        return `<span class="badge-status bg-status-success" style="font-size:0.65rem;">FINALIZADO</span>`;
    }
    
    if (canManage) {
        let options = '<option value="">- Comprador -</option>';
        (AppState.compradorNomes || []).forEach(c => {
            options += `<option value="${c}" ${pedido.comprador === c ? 'selected' : ''}>${c}</option>`;
        });
        return `<select class="select-compact comprador-select-realtime">${options}</select>`;
    }
    
    return `<span style="font-size:0.7rem; opacity:0.7;">Comp: ${pedido.comprador || 'N/A'}</span>`;
}

function renderFooterButtons(pedido, canManage, canEdit) {
    if (pedido.status === 'OK') return '';
    let btns = '';

    if (canEdit) btns += `<button class="btn btn-sm btn-ghost btn--edit" data-tooltip="Editar informações">Editar</button>`;

    if (canManage) {
        // Botão Aguardando Aprovação (Só aparece se não estiver em aprovação, a caminho ou OK)
        if (!['Aguardando Aprovação', 'A Caminho'].includes(pedido.status)) {
            btns += `<button class="btn btn-sm btn-ghost btn-status-approval" data-tooltip="Aguardando Aprovação">Aprovação</button>`;
        }
        // Botão Em Cotação
        if (pedido.status !== 'Em Cotação' && pedido.status !== 'A Caminho') {
            btns += `<button class="btn btn-sm btn-ghost btn-status-cotacao" data-tooltip="Em Cotação">Cotação</button>`;
        }
        // Botão Efetuado (A Caminho)
        if (pedido.status !== 'A Caminho') {
            btns += `<button class="btn btn-sm btn-ghost btn-status-efetuado" data-tooltip="Pedido a caminho">Efetuado</button>`;
        } else {
            btns += `<button class="btn btn-sm btn-ghost btn-marcar-chegada" data-tooltip="Chegada Total">Chegada Total</button>`;
            btns += `<button class="btn btn-sm btn-ghost btn-chegada-parcial" data-tooltip="Chegada Parcial">Parcial</button>`;
        }
    }
    return btns;
}

function adicionarListenersCard(card, pedido, canManage) {
    card.querySelector('.btn-log')?.addEventListener('click', () => openLogModal(pedido.id, 'pedidos'));
    card.querySelector('.btn-delete-card')?.addEventListener('click', () => excluirPedido(pedido.id));
    card.querySelector('.btn--edit')?.addEventListener('click', () => openEditModal(pedido));
    card.querySelector('.comprador-select-realtime')?.addEventListener('change', (e) => atualizarComprador(pedido.id, e.target.value));

    card.querySelector('.btn-status-approval')?.addEventListener('click', () => {
        showConfirmModal('Mudar para "Aguardando Aprovação"?', () => atualizarStatus(pedido.id, 'Aguardando Aprovação'));
    });

    card.querySelector('.btn-status-cotacao')?.addEventListener('click', () => {
        atualizarStatus(pedido.id, 'Em Cotação');
    });

    card.querySelector('.btn-status-efetuado')?.addEventListener('click', () => {
        const select = card.querySelector('.comprador-select-realtime');
        if ((!select || !select.value) && !pedido.comprador) {
            showToast('Selecione um COMPRADOR primeiro.', 'error');
            return;
        }
        showConfirmModal('Marcar como EFETUADO e mover para "A Caminho"?', () => atualizarStatus(pedido.id, 'A Caminho'));
    });

    card.querySelector('.btn-finalize-quick')?.addEventListener('click', () => {
        const comp = card.querySelector('.comprador-select-realtime')?.value || pedido.comprador;
        if (!comp) { showToast('Atribua um comprador.', 'error'); return; }
        showConfirmModal('Finalizar pedido agora?', () => atualizarStatus(pedido.id, 'OK'));
    });

    card.querySelector('.btn-marcar-chegada')?.addEventListener('click', () => {
        showConfirmModal('Confirmar chegada total?', () => atualizarStatus(pedido.id, 'OK'));
    });

    card.querySelector('.btn-chegada-parcial')?.addEventListener('click', () => openPartialArrivalModal(pedido));
}

// --- FUNÇÃO PARA ABRIR MODAL DE CHEGADA PARCIAL (NOVO) ---
function openPartialArrivalModal(pedido) {
    const modalOverlay = document.getElementById('partial-arrival-modal-overlay');
    const form = document.getElementById('form-partial-arrival');
    const container = document.getElementById('partial-items-container');

    if (!modalOverlay || !form || !container) return;

    container.innerHTML = '';

    if (!pedido.itens || pedido.itens.length === 0) {
        // Se for pedido antigo sem itens estruturados
        container.innerHTML = `<p>Este pedido não possui itens estruturados para chegada parcial.</p>`;
    } else {
        pedido.itens.forEach((item, index) => {
            const div = document.createElement('div');
            div.style.marginBottom = '0.5rem';
            div.innerHTML = `
                <label style="display:flex; align-items:center; cursor:pointer;">
                    <input type="checkbox" name="item_chegou" value="${index}" style="margin-right: 10px; width: 20px; height: 20px;">
                    <span><strong>${item.quantidade}x</strong> ${item.codigo}</span>
                </label>
            `;
            container.appendChild(div);
        });
    }

    // Configurar o submit do formulário
    form.onsubmit = async (e) => {
        e.preventDefault();
        const checkboxes = container.querySelectorAll('input[type="checkbox"]:checked');

        if (checkboxes.length === 0) {
            showToast('Selecione pelo menos um item que chegou.', 'error');
            return;
        }

        const indicesItemsChegaram = Array.from(checkboxes).map(cb => parseInt(cb.value));
        const btnSubmit = form.querySelector('button[type="submit"]');

        toggleButtonLoading(btnSubmit, true, 'Processando...');

        try {
            const response = await fetch(`/api/pedidos/${pedido.id}/chegada-parcial`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    indices_itens: indicesItemsChegaram,
                    editor_nome: AppState.currentUser.nome
                })
            });

            if (!response.ok) throw new Error((await response.json()).error || 'Erro ao processar chegada parcial.');

            showToast('Chegada parcial registrada! Pedido dividido.', 'success');
            modalOverlay.style.display = 'none';

            // Recarrega a página atual
            if (window.initPedidosACaminhoPage) window.initPedidosACaminhoPage();

        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            toggleButtonLoading(btnSubmit, false, 'Confirmar Chegada');
        }
    };

    modalOverlay.style.display = 'flex';
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
                <button type="button" class="close-modal close-modal-icon" title="Remover Item">×</button>
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