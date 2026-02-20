/**
 * @file sugestoes.js
 * @description Gerencia a lógica da página de sugestões com 3 colunas: Pendentes, Cogitadas e Em Cotação.
 */

import { AppState } from '../state.js';
import { formatarData, toggleButtonLoading, showConfirmModal } from '../ui.js';
import { renderNewItemRow } from '../forms.js';
import { showToast } from '../toasts.js';

// --- Constantes e Estado do Módulo ---
const TAMANHO_PAGINA = 10;
const STATUS_MAP = {
    pendentes: 'pendente',
    cogitadas: 'cogitado',
    cotacao: 'em_cotacao'
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
        em_cotacao: { itens: [], cursor: null, temMais: true, carregando: false }
    };
    
    if (elementosDOM.listas) {
        Object.values(elementosDOM.listas).forEach(lista => {
            if (lista) lista.innerHTML = '';
        });
    }
}

/**
 * Busca uma página de sugestões da API para um status específico.
 */
async function carregarSugestoesPorStatus(status) {
    const estado = estadoColunas[status];
    if (!estado || estado.carregando || !estado.temMais) return;

    estado.carregando = true;
    const containerPaginacao = document.getElementById(`pagination-${status}`);
    const spinner = containerPaginacao?.querySelector('.spinner');
    const btnVerMais = containerPaginacao?.querySelector('.btn-ver-mais');

    if (spinner) spinner.style.display = 'block';
    if (btnVerMais) btnVerMais.style.display = 'none';

    try {
        const page = estado.itens.length / TAMANHO_PAGINA;
        const { role, nome } = AppState.currentUser;

        let url = `/api/sugestoes/sugestoes-paginadas?status=${status}&limit=${TAMANHO_PAGINA}&page=${page}`;
        url += `&user_role=${encodeURIComponent(role || '')}&user_name=${encodeURIComponent(nome || '')}`;

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
        if (spinner) spinner.style.display = 'none';
    }
}

/** Recarrega completamente os dados de todas as colunas. */
async function resetarErecaregarTudo() {
    resetarEstado();
    const promessas = Object.values(STATUS_MAP).map(status => carregarSugestoesPorStatus(status));
    await Promise.all(promessas);
}

// ==========================================================================
// 2. RENDERIZAÇÃO E LÓGICA DO DOM
// ==========================================================================

/** Renderiza o conteúdo de uma única coluna. */
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
    const btnVerMais = containerPaginacao?.querySelector('.btn-ver-mais');
    if (btnVerMais) {
        btnVerMais.style.display = estado.temMais ? 'block' : 'none';
    }
}

/** Cria o elemento HTML para um card de sugestão. */
function criarItemSugestao(sugestao) {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.id = sugestao.id;

    const { role, nome, permissions } = AppState.currentUser;
    const canManage = role === 'Admin' || role === 'Comprador';
    const isOwner = nome === sugestao.vendedor;
    const isFinalizado = sugestao.status === 'atendido';
    const podeEditarFinalizada = permissions?.pode_editar_sugestao_finalizada;

    // --- LÓGICA DE CORES INVERTIDA CONFORME SOLICITADO ---
    if (sugestao.status === 'em_cotacao') {
        card.classList.add('card-sugestao-cotacao'); // Azul
    } else if (sugestao.status === 'cogitado') {
        card.classList.add('card-sugestao-cogitado'); // Amarelo
    } else {
        card.classList.add('card--status-awaiting'); // Vermelho (Pendente)
    }

    // Cabeçalho (Copiar e Excluir)
    const copyBtnHTML = `<button class="btn-icon btn-copy-sugestao" title="Copiar"><img src="/static/copy.svg" style="width:14px; opacity:0.5;"></button>`;
    const deleteBtnHTML = (canManage && !isFinalizado) ? `<button class="btn-delete-card" title="Excluir">&times;</button>` : '';

    // --- LÓGICA DE BOTÕES DO RODAPÉ ---
    let actionsHTML = '';
    
    // Botão Editar (Sempre à esquerda do grupo)
    if ((!isFinalizado && (canManage || isOwner)) || (isFinalizado && podeEditarFinalizada)) {
        actionsHTML += `<button class="btn btn-sm btn-ghost btn--edit">Editar</button>`;
    }

    if (canManage && !isFinalizado) {
        // Se estiver em COTAÇÃO: pode ATENDER ou voltar para COGITADO
        if (sugestao.status === 'em_cotacao') {
            actionsHTML += `<button class="btn btn-sm btn-ghost btn-cogitar">Mover p/ Cogitado</button>`;
            actionsHTML += `<button class="btn btn-sm btn-atender btn-ghost">Atender Itens</button>`;
        }
        // Se estiver em COGITADO: pode mover para COTAÇÃO
        else if (sugestao.status === 'cogitado') {
            actionsHTML += `<button class="btn btn-sm btn-ghost btn-mover-cotacao">Mover p/ Cotação</button>`;
        }
        // Se estiver PENDENTE: pode ATENDER ou COGITAR
        else if (sugestao.status === 'pendente') {
            actionsHTML += `<button class="btn btn-sm btn-ghost btn-cogitar">Cogitar</button>`;
            actionsHTML += `<button class="btn btn-sm btn-ghost btn-mover-cotacao">Mover p/ Cotação</button>`;
        }
    }

    // Itens e Checkboxes
    let itensHTML = '<ul class="item-list-selectable">';
    (sugestao.itens || []).forEach(item => {
        const checkbox = (canManage && !isFinalizado)
            ? `<input type="checkbox" class="atender-item-checkbox" data-codigo="${item.codigo}" data-quantidade="${item.quantidade || 1}">`
            : '<span style="color:var(--text-muted); font-size:1.2rem;">•</span>';
        itensHTML += `<li><div class="item-content">${checkbox}<span><strong>${item.quantidade || 1}x</strong> ${item.codigo}</span></div></li>`;
    });
    itensHTML += '</ul>';

    card.innerHTML = `
        <div class="card__header">
             <span style="font-size: 0.85rem; opacity: 0.8;"><strong>Vendedor:</strong> ${sugestao.vendedor}</span>
             <div class="card__header-actions">${copyBtnHTML}${deleteBtnHTML}</div>
        </div>
        <div class="card__body" style="padding: 12px;">
            ${itensHTML}
            ${sugestao.observacao_geral ? `<p style="margin-top:8px; font-size:0.8rem; background:var(--bg-muted); padding:4px 8px; border-radius:4px;"><strong>Obs:</strong> ${sugestao.observacao_geral}</p>` : ''}
            <div style="margin-top:10px; display:flex; justify-content:space-between; align-items:center; opacity:0.7; font-size:0.7rem;">
                <span>${formatarData(sugestao.data_criacao)}</span>
                <span>${sugestao.comprador || 'Sem comprador'}</span>
            </div>
            ${canManage && !isFinalizado ? renderSelectComprador(sugestao) : ''}
        </div>
        ${actionsHTML ? `<div class="card__footer"><div class="card__actions">${actionsHTML}</div></div>` : ''}`;

    // Adicionando os Eventos
    card.querySelector('.btn--edit')?.addEventListener('click', () => openEditSugestaoModal(sugestao));
    card.querySelector('.btn-copy-sugestao')?.addEventListener('click', () => handleCopySugestao(sugestao));
    card.querySelector('.btn-delete-card')?.addEventListener('click', () => excluirSugestao(sugestao.id));
    
    if (canManage) {
        card.querySelector('.btn-atender')?.addEventListener('click', (e) => handleAtenderParcial(e, sugestao.id));
        card.querySelector('.btn-cogitar')?.addEventListener('click', () => {
            showConfirmModal("Mover para a coluna de 'Cogitados'?", () => {
                handleApiAction(fetch(`/api/sugestoes/${sugestao.id}/cogitar`, { method: 'PUT' }), 'Movido para Cogitados!');
            });
        });
        card.querySelector('.btn-mover-cotacao')?.addEventListener('click', () => {
            showConfirmModal("Mover para a coluna 'Em Cotação'?", () => {
                handleApiAction(fetch(`/api/sugestoes/${sugestao.id}/mover-para-cotacao`, { method: 'PUT' }), 'Movido para Cotação!');
            });
        });
        card.querySelector('.comprador-select-wrapper select')?.addEventListener('change', (e) => handleCompradorSugestaoChange(sugestao.id, e.target.value));
    }

    return card;
}

// Função auxiliar para o select de comprador dentro do card
function renderSelectComprador(sugestao) {
    let optionsHTML = '<option value="">- Atribuir Comprador -</option>';
    (AppState.compradorNomes || []).forEach(c => {
        optionsHTML += `<option value="${c}" ${sugestao.comprador === c ? 'selected' : ''}>${c}</option>`;
    });
    return `<div class="comprador-select-wrapper" style="margin-top:8px;"><select style="width:100%; padding:2px; font-size:0.75rem; border-radius:4px;">${optionsHTML}</select></div>`;
}

// ==========================================================================
// 3. AÇÕES DA API
// ==========================================================================

async function handleApiAction(actionPromise, successMessage) {
    try {
        const response = await actionPromise;
        if (!response.ok) {
            const result = await response.json();
            throw new Error(result.error || 'Ação falhou.');
        }
        showToast(successMessage, 'success');
        await resetarErecaregarTudo();
    } catch (error) {
        console.error('Erro na API:', error);
        showToast(error.message, 'error');
    }
}

function handleAtenderParcial(event, sugestaoId) {
    const cardElement = event.target.closest('.card');
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
    handleApiAction(promise, 'Itens atendidos e movidos para o histórico!');
}

function changeSugestaoStatus(sugestaoId, action) {
    showConfirmModal(`Mover esta sugestão para ${action.toUpperCase()}?`, () => {
        const promise = fetch(`/api/sugestoes/${sugestaoId}/${action}`, { method: 'PUT' });
        handleApiAction(promise, 'Status atualizado!');
    });
}

function excluirSugestao(sugestaoId) {
    showConfirmModal('Tem certeza que deseja EXCLUIR esta sugestão?', () => {
        const promise = fetch(`/api/sugestoes/${sugestaoId}`, { method: 'DELETE' });
        handleApiAction(promise, 'Sugestão excluída.');
    });
}

function handleCompradorSugestaoChange(sugestaoId, novoComprador) {
    const promise = fetch(`/api/sugestoes/${sugestaoId}/comprador`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comprador: novoComprador }),
    });
    handleApiAction(promise, 'Comprador atualizado!');
}

function handleCopySugestao(sugestao) {
    const texto = sugestao.itens.map(i => `${i.quantidade || 1}x ${i.codigo}`).join('\n');
    navigator.clipboard.writeText(texto).then(() => showToast('Copiado!', 'success'));
}

// ==========================================================================
// 4. FORMULÁRIOS E MODAIS
// ==========================================================================

function handleMultiSugestaoFormSubmit() {
    const form = document.getElementById('form-sugestao');
    if (!form) return;
    const submitBtn = form.querySelector('button[type="submit"]');

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        toggleButtonLoading(submitBtn, true, 'Enviando...');

        const itemRows = document.querySelectorAll('#sugestao-itens-container .item-row');
        const itens = [];
        
        itemRows.forEach(row => {
            const codigo = row.querySelector('.item-codigo').value.trim();
            const quantidade = row.querySelector('.item-quantidade').value;
            if (codigo) {
                itens.push({ codigo, quantidade: quantidade || '1', status: 'pendente' });
            }
        });

        if (itens.length === 0) {
            showToast("Adicione pelo menos um item.", "error");
            toggleButtonLoading(submitBtn, false, 'Salvar Sugestões');
            return;
        }

        const dados = {
            vendedor: AppState.currentUser.nome,
            itens: itens,
            observacao_geral: document.getElementById('sugestao-observacao-geral').value.trim()
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
                showToast('Sugestão criada!', 'success');
                await resetarErecaregarTudo();
            }
        } catch (error) {
            showToast('Erro ao enviar.', 'error');
        } finally {
            toggleButtonLoading(submitBtn, false, 'Salvar Sugestões');
        }
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

    btnCancel.onclick = () => modalOverlay.style.display = 'none';

    btnAddItem.onclick = () => {
        itensContainer.insertAdjacentHTML('beforeend', `
            <div class="item-row item-row-edit">
                <div class="item-row-header">
                    <h4>Item</h4> 
                    <button type="button" class="close-modal close-modal-icon">×</button>
                </div>
                <div class="item-row-fields">
                    <div class="form-group" style="flex-grow: 1;"><label>Código</label><input type="text" class="item-codigo" required></div>
                    <div class="form-group" style="width: 80px;"><label>Qtd</label><input type="number" class="item-quantidade" value="1" min="1" required></div>
                </div>
            </div>`);
    };

    itensContainer.onclick = (e) => {
        if (e.target.classList.contains('close-modal')) e.target.closest('.item-row-edit').remove();
    };

    form.onsubmit = async (e) => {
        e.preventDefault();
        toggleButtonLoading(btnSave, true, 'Salvando...');
        
        const itens = Array.from(form.querySelectorAll('.item-row-edit')).map(row => ({
            codigo: row.querySelector('.item-codigo').value.trim(),
            quantidade: row.querySelector('.item-quantidade').value
        }));

        const dados = {
            itens: itens,
            observacao_geral: document.getElementById('edit-sug-descricao').value,
            vendedor: document.getElementById('edit-sug-vendedor').value
        };

        handleApiAction(fetch(`/api/sugestoes/${form.dataset.sugestaoId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados)
        }), 'Alterações salvas!');
        
        modalOverlay.style.display = 'none';
        toggleButtonLoading(btnSave, false, 'Salvar Alterações');
    };
}

function openEditSugestaoModal(sugestao) {
    const modal = document.getElementById('edit-sugestao-modal-overlay');
    const form = document.getElementById('form-edit-sugestao');
    const container = document.getElementById('edit-sugestao-itens-container');
    const vendedorSelect = document.getElementById('edit-sug-vendedor');

    form.dataset.sugestaoId = sugestao.id;
    container.innerHTML = '';
    
    // Popular vendedores no select
    vendedorSelect.innerHTML = listaDeVendedores.map(v => `<option value="${v}" ${v === sugestao.vendedor ? 'selected' : ''}>${v}</option>`).join('');

    sugestao.itens.forEach(item => {
        container.insertAdjacentHTML('beforeend', `
            <div class="item-row item-row-edit">
                <div class="item-row-header">
                    <h4>Item</h4> 
                    <button type="button" class="close-modal close-modal-icon">×</button>
                </div>
                <div class="item-row-fields">
                    <div class="form-group" style="flex-grow: 1;"><label>Código</label><input type="text" class="item-codigo" value="${item.codigo}" required></div>
                    <div class="form-group" style="width: 80px;"><label>Qtd</label><input type="number" class="item-quantidade" value="${item.quantidade || 1}" min="1" required></div>
                </div>
            </div>`);
    });

    document.getElementById('edit-sug-descricao').value = sugestao.observacao_geral || '';
    modal.style.display = 'flex';
}

// ==========================================================================
// 5. INICIALIZAÇÃO
// ==========================================================================

export async function initSugestoesPage() {
    elementosDOM = {
        listas: {
            pendentes: document.getElementById('lista-sugestoes-pendentes'),
            cogitadas: document.getElementById('lista-sugestoes-cogitadas'),
            cotacao: document.getElementById('lista-sugestoes-cotacao'),
        },
        filtroInput: document.getElementById('filtro-sugestoes')
    };

    // Evento de busca
    elementosDOM.filtroInput?.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        termoBuscaAtual = e.target.value.trim();
        debounceTimer = setTimeout(() => resetarErecaregarTudo(), 500);
    });

    // Eventos de paginação
    Object.values(STATUS_MAP).forEach(status => {
        const btn = document.getElementById(`pagination-${status}`)?.querySelector('.btn-ver-mais');
        btn?.addEventListener('click', () => carregarSugestoesPorStatus(status));
    });

    // Carregar lista de vendedores para o modal
    try {
        const res = await fetch('/api/usuarios/vendedor-nomes');
        if (res.ok) listaDeVendedores = await res.json();
    } catch (e) { console.error("Erro vendedores", e); }

    handleMultiSugestaoFormSubmit();
    setupEditSugestaoModal();
    
    const btnAdd = document.getElementById('btn-add-sugestao-item');
    btnAdd?.addEventListener('click', () => renderNewItemRow('sugestao-itens-container', 'Sugestão'));

    // Primeira carga
    renderNewItemRow('sugestao-itens-container', 'Sugestão');
    await resetarErecaregarTudo();
}