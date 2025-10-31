/**
 * @file sugestoes.js
 * @description Gerencia a lógica da página de sugestões com carregamento paginado para alta performance.
 */

// --- Importações de Módulos ---
import { AppState } from '../state.js';
import { formatarData, toggleButtonLoading, showConfirmModal } from '../ui.js';
import { renderNewItemRow } from '../forms.js';
import { showToast } from '../toasts.js';

// --- Constantes e Estado do Módulo ---
const TAMANHO_PAGINA = 10;
const STATUS_MAP = {
    pendentes: 'pendente',
    cogitadas: 'cogitado',
    parciais: 'parcialmente_atendido',
    atendidas: 'atendido'
};

let elementosDOM = {};
let estadoColunas = {};
let termoBuscaAtual = '';
let debounceTimer;
let listaDeVendedores = [];

// ==========================================================================
// 1. LÓGICA DE CARREGAMENTO E ESTADO
// ==========================================================================

/** Reinicia o estado de todas as colunas para um novo carregamento. */
function resetarEstado() {
    estadoColunas = {
        pendente: { itens: [], cursor: null, temMais: true, carregando: false },
        cogitado: { itens: [], cursor: null, temMais: true, carregando: false },
        parcialmente_atendido: { itens: [], cursor: null, temMais: true, carregando: false },
        atendido: { itens: [], cursor: null, temMais: true, carregando: false }
    };
    Object.values(elementosDOM.listas).forEach(lista => lista.innerHTML = '');
}

/**
 * Busca uma página de sugestões da API para um status específico.
 * @param {string} status - O status a ser buscado ('pendente', 'cogitado', etc.).
 */
async function carregarSugestoesPorStatus(status) {
    const estado = estadoColunas[status];
    if (estado.carregando || !estado.temMais) return;

    estado.carregando = true;
    const containerPaginacao = document.getElementById(`pagination-${status}`);
    const spinner = containerPaginacao.querySelector('.spinner');
    const btnVerMais = containerPaginacao.querySelector('.btn-ver-mais');

    spinner.style.display = 'block';
    btnVerMais.style.display = 'none';

    try {
        const page = estado.itens.length / TAMANHO_PAGINA;
        let url = `/api/sugestoes-paginadas?status=${status}&limit=${TAMANHO_PAGINA}&page=${page}`;
        if (termoBuscaAtual) {
            url += `&search=${encodeURIComponent(termoBuscaAtual)}`;
        }

        const response = await fetch(url);
        if (!response.ok) throw new Error('Falha na resposta da API.');

        const data = await response.json();

        if (data.sugestoes && data.sugestoes.length > 0) {
            estado.itens.push(...data.sugestoes);
        }

        estado.temMais = data.temMais;
        renderizarColuna(status);

    } catch (error) {
        console.error(`Erro ao carregar sugestões [${status}]:`, error);
        showToast(`Não foi possível carregar a coluna ${status}.`, 'error');
    } finally {
        estado.carregando = false;
        spinner.style.display = 'none';
    }
}

/** Recarrega completamente os dados de todas as colunas. */
async function resetarErecaregarTudo() {
    resetarEstado();
    await Promise.all(Object.values(STATUS_MAP).map(status => carregarSugestoesPorStatus(status)));
}

// ==========================================================================
// 2. RENDERIZAÇÃO E LÓGICA DO DOM
// ==========================================================================

/**
 * Renderiza o conteúdo de uma única coluna com base em seu estado atual.
 * @param {string} status - O status da coluna a ser renderizada.
 */
function renderizarColuna(status) {
    const estado = estadoColunas[status];
    const listaId = Object.keys(STATUS_MAP).find(key => STATUS_MAP[key] === status);
    const listaElement = elementosDOM.listas[listaId];

    if (!listaElement) return;

    listaElement.innerHTML = '';

    if (estado.itens.length === 0) {
        listaElement.innerHTML = `<p class="sugestao-item-vazio">Nenhuma sugestão encontrada.</p>`;
    } else {
        estado.itens.forEach(item => {
            listaElement.appendChild(criarItemSugestao(item));
        });
    }

    const containerPaginacao = document.getElementById(`pagination-${status}`);
    const btnVerMais = containerPaginacao.querySelector('.btn-ver-mais');
    btnVerMais.style.display = estado.temMais ? 'block' : 'none';
}

/**
 * Cria e retorna o elemento HTML para um card de sugestão.
 */
function criarItemSugestao(sugestao) {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.id = sugestao.id;

    if (sugestao.status === 'atendido') card.classList.add('card--status-done');
    else if (sugestao.status === 'cogitado' || sugestao.status === 'parcialmente_atendido') card.classList.add('card--status-progress');
    else card.classList.add('card--status-awaiting');

    const { role, nome, permissions } = AppState.currentUser;
    const canManage = role === 'Admin' || role === 'Comprador';
    const isOwner = nome === sugestao.vendedor;
    const isFinalizado = sugestao.status === 'atendido';
    const hasPendingItems = sugestao.itens?.some(item => (item.status || 'pendente') === 'pendente');

    const podeEditarFinalizada = permissions?.pode_editar_sugestao_finalizada;

    let actionsHTML = '';
    if ((!isFinalizado && (canManage || isOwner)) || (isFinalizado && podeEditarFinalizada)) {
        actionsHTML += `<button class="btn btn--edit">Editar</button>`;
    }

    if (canManage) {
        if ((sugestao.status === 'pendente' || sugestao.status === 'cogitado' || sugestao.status === 'parcialmente_atendido') && hasPendingItems) {
            actionsHTML += `<button class="btn btn--success btn-atender-parcial">Atender Itens</button>`;
        }
        if (sugestao.status === 'pendente') {
            actionsHTML += `<button class="btn btn--warning btn-cogitar">Cogitar</button>`;
        }
        if (sugestao.status === 'parcialmente_atendido') {
            actionsHTML += `<button class="btn btn--success btn-finalizar-parcial">Finalizar Pedido</button>`;
        }
        // MUDANÇA: O botão excluir agora aparece em cards finalizados se o usuário tiver permissão
        if (!isFinalizado || (isFinalizado && podeEditarFinalizada)) {
            actionsHTML += `<button class="btn btn--danger btn-excluir">Excluir</button>`;
        }
    }

    let itensHTML = '<ul class="item-list-selectable">';
    (sugestao.itens || []).forEach(item => {
        // MUDANÇA: Força o status 'atendido' para todos os itens se a sugestão principal for 'atendido'
        const isAttended = sugestao.status === 'atendido' || item.status === 'atendido';

        const checkboxOrBullet = !isAttended && canManage
            ? `<input type="checkbox" class="atender-item-checkbox" data-codigo="${item.codigo}" data-quantidade="${item.quantidade || 1}">`
            : '•';

        const statusClass = isAttended ? 'item-status-badge--atendido' : 'item-status-badge--pendente';
        const statusText = isAttended ? 'Atendido' : 'Pendente';
        const statusBadge = `<span class="item-status-badge ${statusClass}">${statusText}</span>`;

        itensHTML += `
            <li>
                <div class="item-content">
                    <div class="item-checkbox-wrapper">${checkboxOrBullet}</div>
                    <div class="item-text-wrapper">
                        <span><strong>${item.quantidade || 1}x</strong> ${item.codigo}</span>
                        ${statusBadge}
                    </div>
                </div>
            </li>`;
    });
    itensHTML += '</ul>';

    let compradorHTML = '';
    if (canManage) {
        let optionsHTML = '<option value="">- Atribuir a mim -</option>';
        const listaCompradores = AppState.compradorNomes || [];
        listaCompradores.forEach(c => {
            const isSelected = sugestao.comprador === c ? 'selected' : '';
            optionsHTML += `<option value="${c}" ${isSelected}>${c}</option>`;
        });
        compradorHTML = `<div class="comprador-select-wrapper"><label>Atribuir Comprador:</label><select>${optionsHTML}</select></div>`;
    } else {
        compradorHTML = `<p><strong>Comprador:</strong> ${sugestao.comprador || 'Não atribuído'}</p>`;
    }

    const copyBtnHTML = `
        <button class="btn-icon btn-copy-sugestao" title="Copiar Itens" style="width: 28px; height: 28px;">
            <img src="/static/copy.svg" alt="Copiar" style="filter: invert(0.5);">
        </button>`;

    card.innerHTML = `
        <div class="card__header" style="padding-bottom: 0.5rem;">
             <p style="margin: 0;"><strong>Vendedor:</strong> ${sugestao.vendedor}</p>
             ${copyBtnHTML}
        </div>
        <div class="card__body" style="padding-top: 0.5rem;">
            ${itensHTML}
            ${sugestao.observacao_geral ? `<p><strong>Obs:</strong> ${sugestao.observacao_geral}</p>` : ''}
            <p><small>${formatarData(sugestao.data_criacao)}</small></p>
            ${compradorHTML} 
        </div>
        <div class="card__footer">
            <div class="card__actions">${actionsHTML}</div>
        </div>`;

    if ((!isFinalizado && (canManage || isOwner)) || (isFinalizado && podeEditarFinalizada)) {
        card.querySelector('.btn--edit')?.addEventListener('click', () => openEditSugestaoModal(sugestao));
    }

    if (canManage) {
        card.querySelector('.btn-atender-parcial')?.addEventListener('click', (e) => handleAtenderParcial(e, sugestao.id));
        card.querySelector('.btn-cogitar')?.addEventListener('click', () => changeSugestaoStatus(sugestao.id, 'cogitar'));
        card.querySelector('.btn-finalizar-parcial')?.addEventListener('click', () => finalizarPedidoParcial(sugestao.id));
        card.querySelector('.btn-excluir')?.addEventListener('click', () => excluirSugestao(sugestao.id));
        card.querySelector('.comprador-select-wrapper select')?.addEventListener('change', (e) => handleCompradorSugestaoChange(sugestao.id, e.target.value));
    }

    card.querySelector('.btn-copy-sugestao').addEventListener('click', () => handleCopySugestao(sugestao));

    return card;
}


// ==========================================================================
// 3. AÇÕES DO USUÁRIO E FORMULÁRIOS (API Calls)
// ==========================================================================

async function handleApiAction(actionPromise, successMessage) {
    try {
        const response = await actionPromise;
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Ação falhou.');
        showToast(successMessage, 'success');
        await resetarErecaregarTudo();
    } catch (error) {
        console.error('Erro na ação da API:', error);
        showToast(`Erro: ${error.message}`, 'error');
    }
}

function handleAtenderParcial(event, sugestaoId) {
    const cardElement = event.target.closest('.card');
    if (!cardElement) {
        console.error("Não foi possível encontrar o elemento do card. Ação cancelada.");
        showToast("Erro interno: elemento do card não encontrado.", "error");
        return;
    }

    const checkboxes = cardElement.querySelectorAll('.atender-item-checkbox:checked');
    if (checkboxes.length === 0) {
        showToast('Selecione pelo menos um item para atender.', 'info');
        return;
    }
    const itensParaAtender = Array.from(checkboxes).map(cb => ({
        codigo: cb.dataset.codigo,
        quantidade: cb.dataset.quantidade
    }));

    const promise = fetch(`/api/sugestoes/${sugestaoId}/atender-itens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itens: itensParaAtender }),
    });
    handleApiAction(promise, 'Itens atendidos com sucesso!');
}

/**
 * --- INÍCIO DA CORREÇÃO ---
 * Função para copiar o conteúdo da sugestão para a área de transferência.
 * Inclui um fallback para ambientes não seguros (HTTP).
 */
function handleCopySugestao(sugestao) {
    const textoParaCopiar = sugestao.itens.map(item => `${item.quantidade || 1}x ${item.codigo}`).join('\n');

    // Tenta usar a API moderna (só funciona em HTTPS/localhost)
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(textoParaCopiar)
            .then(() => {
                showToast('Itens copiados para a área de transferência!', 'success');
            })
            .catch(err => {
                console.error('Falha ao copiar (API moderna):', err);
                showToast('Não foi possível copiar os itens.', 'error');
            });
    } else {
        // Fallback para HTTP ou navegadores mais antigos
        const textArea = document.createElement("textarea");
        textArea.value = textoParaCopiar;
        // Evita que o textarea pisque na tela
        textArea.style.position = "fixed";
        textArea.style.top = "-9999px";
        textArea.style.left = "-9999px";

        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        try {
            const successful = document.execCommand('copy');
            if (successful) {
                showToast('Itens copiados para a área de transferência!', 'success');
            } else {
                throw new Error('execCommand retornou false');
            }
        } catch (err) {
            console.error('Falha ao copiar (fallback):', err);
            showToast('Não foi possível copiar. Esta função pode requerer uma conexão segura (HTTPS).', 'error');
        }

        document.body.removeChild(textArea);
    }
}
// --- FIM DA CORREÇÃO ---


function changeSugestaoStatus(sugestaoId, action) {
    showConfirmModal(`Mover esta sugestão para "${action.toUpperCase()}"?`, () => {
        const promise = fetch(`/api/sugestoes/${sugestaoId}/${action}`, { method: 'PUT' });
        handleApiAction(promise, 'Status da sugestão atualizado!');
    });
}

function excluirSugestao(sugestaoId) {
    showConfirmModal('Tem certeza que deseja EXCLUIR esta sugestão?', () => {
        const promise = fetch(`/api/sugestoes/${sugestaoId}`, { method: 'DELETE' });
        handleApiAction(promise, 'Sugestão excluída com sucesso.');
    });
}

function finalizarPedidoParcial(sugestaoId) {
    const message = "Itens atendidos irão para 'Finalizados' e pendentes para 'Cogitados'. Continuar?";
    showConfirmModal(message, () => {
        const promise = fetch(`/api/sugestoes/${sugestaoId}/finalizar-parcial`, { method: 'POST' });
        handleApiAction(promise, 'Pedido parcial finalizado!');
    });
}

function handleCompradorSugestaoChange(sugestaoId, novoComprador) {
    const promise = fetch(`/api/sugestoes/${sugestaoId}/comprador`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comprador: novoComprador }),
    });
    handleApiAction(promise, 'Comprador da sugestão foi atualizado!');
}

function handleMultiSugestaoFormSubmit() {
    const form = document.getElementById('form-sugestao');
    if (!form) return;
    const submitBtn = form.querySelector('button[type="submit"]');
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        toggleButtonLoading(submitBtn, true, 'Enviando...');
        const itemRows = document.querySelectorAll('#sugestao-itens-container .item-row');
        const itens = [];
        let hasError = false;
        itemRows.forEach(row => {
            const codigo = row.querySelector('.item-codigo').value.trim();
            const quantidade = row.querySelector('.item-quantidade').value;
            if (codigo) {
                itens.push({
                    codigo,
                    quantidade: quantidade || '1',
                    status: 'pendente'
                });
            } else {
                hasError = true;
            }
        });
        if (hasError || itens.length === 0) {
            showToast("Preencha o código para todos os itens antes de salvar.", "error");
            toggleButtonLoading(submitBtn, false, 'Salvar Sugestões');
            return;
        }
        const observacaoGeral = document.getElementById('sugestao-observacao-geral').value.trim();
        const dados = {
            vendedor: AppState.currentUser.nome,
            itens: itens,
            observacao_geral: observacaoGeral
        };
        try {
            const response = await fetch('/api/sugestoes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dados),
            });
            if (response.ok) {
                document.getElementById('sugestao-itens-container').innerHTML = '';
                form.reset();
                renderNewItemRow('sugestao-itens-container', 'Sugestão');
                showToast('Sugestões salvas com sucesso!', 'success');
                await resetarErecaregarTudo();
            } else {
                const errorData = await response.json().catch(() => ({ message: 'Erro desconhecido.' }));
                throw new Error(errorData.message || errorData.error);
            }
        } catch (error) {
            showToast(`Falha ao enviar: ${error.message}`, 'error');
        } finally {
            toggleButtonLoading(submitBtn, false, 'Salvar Sugestões');
        }
    });
}

function createEditSugestaoItemRowHTML(item = { codigo: '', quantidade: 1 }) {
    return `
        <div class="item-row item-row-edit">
            <div class="item-row-header">
                <h4>Item</h4> 
                <button type="button" class="close-modal close-modal-icon" title="Remover Item">×</button>
            </div>
            <div class="item-row-fields">
                <div class="form-group" style="flex-grow: 1;">
                    <label>Código do Produto</label>
                    <input type="text" class="item-codigo" value="${item.codigo || ''}" required>
                </div>
                <div class="form-group" style="width: 80px;">
                    <label>Qtd</label>
                    <input type="number" class="item-quantidade" value="${item.quantidade || 1}" min="1" required>
                </div>
            </div>
        </div>
    `;
}

function openEditSugestaoModal(sugestao) {
    const modalOverlay = document.getElementById('edit-sugestao-modal-overlay');
    const form = document.getElementById('form-edit-sugestao');
    const itensContainer = document.getElementById('edit-sugestao-itens-container');
    const observacaoInput = document.getElementById('edit-sug-descricao');
    const vendedorSelect = document.getElementById('edit-sug-vendedor');

    if (!modalOverlay || !form || !itensContainer || !observacaoInput || !vendedorSelect) return;

    populateSelect(vendedorSelect, listaDeVendedores, sugestao.vendedor);

    form.dataset.sugestaoId = sugestao.id;
    itensContainer.innerHTML = '';

    if (sugestao.itens && sugestao.itens.length > 0) {
        sugestao.itens.forEach(item => {
            itensContainer.insertAdjacentHTML('beforeend', createEditSugestaoItemRowHTML(item));
        });
    } else {
        itensContainer.insertAdjacentHTML('beforeend', createEditSugestaoItemRowHTML());
    }

    observacaoInput.value = sugestao.observacao_geral || '';
    modalOverlay.style.display = 'flex';
    setTimeout(() => itensContainer.querySelector('.item-codigo')?.focus(), 100);
}

function populateSelect(selectElement, dataList, selectedValue) {
    selectElement.innerHTML = '';
    dataList.forEach(nome => {
        const option = document.createElement('option');
        option.value = nome;
        option.textContent = nome;
        if (nome === selectedValue) {
            option.selected = true;
        }
        selectElement.appendChild(option);
    });
}


function setupEditSugestaoModal() {
    const modalOverlay = document.getElementById('edit-sugestao-modal-overlay');
    if (!modalOverlay) return;

    const form = document.getElementById('form-edit-sugestao');
    const btnCancel = document.getElementById('btn-cancel-edit-sugestao');
    const btnSave = document.getElementById('btn-save-edit-sugestao');
    const btnAddItem = document.getElementById('btn-add-edit-sugestao-item');
    const itensContainer = document.getElementById('edit-sugestao-itens-container');

    const closeModal = () => modalOverlay.style.display = 'none';

    btnCancel.onclick = closeModal;
    btnAddItem.onclick = () => {
        itensContainer.insertAdjacentHTML('beforeend', createEditSugestaoItemRowHTML());
    };

    itensContainer.addEventListener('click', (e) => {
        if (e.target && (e.target.classList.contains('close-modal') || e.target.closest('.close-modal'))) {
            e.target.closest('.item-row-edit').remove();
        }
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        toggleButtonLoading(btnSave, true, 'Salvando...');

        const sugestaoId = form.dataset.sugestaoId;
        const itens = [];
        let hasError = false;

        form.querySelectorAll('.item-row-edit').forEach(row => {
            const codigo = row.querySelector('.item-codigo').value.trim();
            const quantidade = row.querySelector('.item-quantidade').value;
            if (codigo && quantidade) {
                itens.push({ codigo, quantidade: parseInt(quantidade, 10) || 1 });
            } else if (codigo || quantidade) {
                hasError = true;
            }
        });

        if (hasError) {
            showToast('Preencha código e quantidade para todos os itens ou remova linhas vazias.', 'error');
            toggleButtonLoading(btnSave, false, 'Salvar Alterações');
            return;
        }

        const dadosAtualizados = {
            itens: itens,
            observacao_geral: document.getElementById('edit-sug-descricao').value.trim(),
            vendedor: document.getElementById('edit-sug-vendedor').value
        };

        try {
            const response = await fetch(`/api/sugestoes/${sugestaoId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dadosAtualizados)
            });
            if (response.ok) {
                closeModal();
                showToast('Sugestão salva com sucesso!', 'success');
                await resetarErecaregarTudo();
            } else {
                throw new Error('Falha ao salvar a sugestão.');
            }
        } catch (error) {
            showToast(`Erro ao salvar: ${error.message}`, 'error');
        } finally {
            toggleButtonLoading(btnSave, false, 'Salvar Alterações');
        }
    });
}

async function fetchInitialData() {
    try {
        const response = await fetch('/api/usuarios/vendedor-nomes');
        if (!response.ok) throw new Error('Falha ao buscar vendedores.');
        listaDeVendedores = await response.json();
    } catch (error) {
        console.error(error);
        showToast(error.message, 'error');
    }
}

export async function initSugestoesPage() {
    elementosDOM = {
        listas: {
            pendentes: document.getElementById('lista-sugestoes-pendentes'),
            cogitadas: document.getElementById('lista-sugestoes-cogitadas'),
            parciais: document.getElementById('lista-sugestoes-parciais'),
            atendidas: document.getElementById('lista-sugestoes-atendidas')
        },
        filtroInput: document.getElementById('filtro-sugestoes')
    };

    elementosDOM.filtroInput.disabled = false;
    elementosDOM.filtroInput.placeholder = '🔎 Buscar por código, vendedor, comprador...';

    elementosDOM.filtroInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        const termo = e.target.value.trim();
        debounceTimer = setTimeout(() => {
            if (termo !== termoBuscaAtual) {
                termoBuscaAtual = termo;
                console.log(`Iniciando busca por: "${termoBuscaAtual}"`);
                resetarErecaregarTudo();
            }
        }, 500);
    });

    Object.values(STATUS_MAP).forEach(status => {
        const container = document.getElementById(`pagination-${status}`);
        if (container) {
            container.querySelector('.btn-ver-mais').addEventListener('click', () => carregarSugestoesPorStatus(status));
        }
    });

    handleMultiSugestaoFormSubmit();
    setupEditSugestaoModal();

    const btnAddItem = document.getElementById('btn-add-sugestao-item');
    if (btnAddItem) {
        btnAddItem.addEventListener('click', () => {
            const newItemRow = renderNewItemRow('sugestao-itens-container', 'Sugestão');
            newItemRow.querySelector('.item-codigo')?.focus();
        });
    }
    renderNewItemRow('sugestao-itens-container', 'Sugestão');

    await fetchInitialData();
    await resetarErecaregarTudo();
}