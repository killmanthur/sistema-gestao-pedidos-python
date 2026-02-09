import { AppState } from '../state.js';
import { formatarData, toggleButtonLoading } from '../ui.js';
import { showToast } from '../toasts.js';

let paginaAtual = 0;
let temMais = true;
let carregando = false;
let termoBusca = '';
let debounceTimer;
let containerCards;
let btnCarregarMais;
let spinner;
let listaDeVendedores = []; // Armazena vendedores para o dropdown de edição

// --- FUNÇÕES AUXILIARES DO MODAL ---

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

function populateSelect(selectElement, dataList, selectedValue) {
    if (!selectElement) return;
    selectElement.innerHTML = '';
    dataList.forEach(nome => {
        const option = document.createElement('option');
        option.value = nome;
        option.textContent = nome;
        if (nome === selectedValue) option.selected = true;
        selectElement.appendChild(option);
    });
}

function openEditModal(sugestao) {
    const modalOverlay = document.getElementById('edit-sugestao-modal-overlay');
    const form = document.getElementById('form-edit-sugestao');
    const itensContainer = document.getElementById('edit-sugestao-itens-container');
    const observacaoInput = document.getElementById('edit-sug-descricao');
    const vendedorSelect = document.getElementById('edit-sug-vendedor');

    if (!modalOverlay || !form) return;

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

    // Configura os botões de fechar item dinâmicos
    itensContainer.querySelectorAll('.close-modal').forEach(btn => {
        btn.onclick = (e) => e.target.closest('.item-row-edit').remove();
    });

    modalOverlay.style.display = 'flex';
}

// --- FUNÇÃO DE COPIAR ---
function handleCopySugestao(sugestao) {
    const textoParaCopiar = sugestao.itens.map(item => `${item.quantidade || 1}x ${item.codigo}`).join('\n');
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(textoParaCopiar)
            .then(() => showToast('Itens copiados!', 'success'))
            .catch(() => showToast('Erro ao copiar itens.', 'error'));
    } else {
        const textArea = document.createElement("textarea");
        textArea.value = textoParaCopiar;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
            document.execCommand('copy');
            showToast('Itens copiados!', 'success');
        } catch (err) {
            showToast('Erro ao copiar.', 'error');
        }
        document.body.removeChild(textArea);
    }
}

// --- CRIAÇÃO DO CARD ---
function criarCardHistorico(sugestao) {
    const card = document.createElement('div');
    card.className = 'card card--status-done';

    let itensHTML = '<ul class="item-list-selectable">';
    (sugestao.itens || []).forEach(item => {
        itensHTML += `
            <li>
                <div class="item-content">
                    <span style="color: var(--text-muted);">•</span>
                    <div class="item-text-wrapper">
                        <span><strong>${item.quantidade || 1}x</strong> ${item.codigo}</span>
                        <span class="item-status-badge item-status-badge--atendido">Atendido</span>
                    </div>
                </div>
            </li>`;
    });
    itensHTML += '</ul>';

    const copyBtnHTML = `
        <button class="btn-icon btn-copy-sugestao" title="Copiar Itens" style="width: 28px; height: 28px; margin-left: auto;">
            <img src="/static/copy.svg" alt="Copiar" style="filter: invert(0.5);">
        </button>`;

    // Permissões de edição
    const { role, nome, permissions } = AppState.currentUser;
    const isOwner = nome === sugestao.vendedor;
    const canEdit = role === 'Admin' || role === 'Comprador' || isOwner || permissions?.pode_editar_sugestao_finalizada;

    let editBtnHTML = '';
    if (canEdit) {
        editBtnHTML = `<button class="btn btn--edit btn-sm" style="margin-top:0.5rem;">Editar</button>`;
    }

    card.innerHTML = `
        <div class="card__header" style="display: flex; align-items: center;">
             <p style="margin: 0;"><strong>Vendedor:</strong> ${sugestao.vendedor}</p>
             ${copyBtnHTML}
        </div>
        <div class="card__body">
            ${itensHTML}
            ${sugestao.observacao_geral ? `<p><strong>Obs:</strong> ${sugestao.observacao_geral}</p>` : ''}
            <p><small>Criado em: ${formatarData(sugestao.data_criacao)}</small></p>
            <p><strong>Comprador:</strong> ${sugestao.comprador || 'N/A'}</p>
            ${editBtnHTML}
        </div>
    `;

    card.querySelector('.btn-copy-sugestao').addEventListener('click', () => handleCopySugestao(sugestao));

    if (canEdit) {
        card.querySelector('.btn--edit').addEventListener('click', () => openEditModal(sugestao));
    }

    return card;
}

async function carregarDados(reset = false) {
    if (carregando || (!temMais && !reset)) return;
    carregando = true;
    spinner.style.display = 'block';
    btnCarregarMais.style.display = 'none';

    if (reset) {
        paginaAtual = 0;
        temMais = true;
        containerCards.innerHTML = '';
    }

    try {
        const { role, nome } = AppState.currentUser;
        let url = `/api/sugestoes/sugestoes-paginadas?status=atendido&limit=20&page=${paginaAtual}`;
        url += `&user_role=${encodeURIComponent(role || '')}&user_name=${encodeURIComponent(nome || '')}`;
        if (termoBusca) url += `&search=${encodeURIComponent(termoBusca)}`;

        const res = await fetch(url);
        const data = await res.json();

        if (data.sugestoes.length === 0 && reset) {
            containerCards.innerHTML = '<p style="grid-column: 1/-1; text-align: center;">Nenhuma sugestão finalizada encontrada.</p>';
        } else {
            data.sugestoes.forEach(s => {
                containerCards.appendChild(criarCardHistorico(s));
            });
        }
        temMais = data.temMais;
        if (temMais) paginaAtual++;
    } catch (e) {
        console.error(e);
        showToast('Erro ao carregar histórico.', 'error');
    } finally {
        carregando = false;
        spinner.style.display = 'none';
        btnCarregarMais.style.display = temMais ? 'block' : 'none';
    }
}

async function fetchVendedores() {
    try {
        const res = await fetch('/api/usuarios/vendedor-nomes');
        if (res.ok) listaDeVendedores = await res.json();
    } catch (e) { console.error('Erro ao buscar vendedores'); }
}

export async function initHistoricoSugestoesPage() {
    containerCards = document.getElementById('container-historico-sugestoes');
    btnCarregarMais = document.getElementById('btn-carregar-mais');
    spinner = document.getElementById('loading-spinner');
    const filtroInput = document.getElementById('filtro-historico-sugestoes');

    // Configuração do Modal
    const modalOverlay = document.getElementById('edit-sugestao-modal-overlay');
    const form = document.getElementById('form-edit-sugestao');
    const btnCancel = document.getElementById('btn-cancel-edit-sugestao');
    const btnSave = document.getElementById('btn-save-edit-sugestao');
    const btnAddItem = document.getElementById('btn-add-edit-sugestao-item');
    const itensContainer = document.getElementById('edit-sugestao-itens-container');

    if (!containerCards) return;

    await fetchVendedores();

    // Eventos da Página
    btnCarregarMais.onclick = () => carregarDados(false);
    filtroInput.oninput = (e) => {
        clearTimeout(debounceTimer);
        termoBusca = e.target.value.trim();
        debounceTimer = setTimeout(() => carregarDados(true), 500);
    };

    // Eventos do Modal
    if (modalOverlay) {
        // Fechar
        modalOverlay.onclick = (e) => { if (e.target === modalOverlay) modalOverlay.style.display = 'none'; };
        btnCancel.onclick = () => modalOverlay.style.display = 'none';

        // Adicionar Item
        btnAddItem.onclick = () => {
            itensContainer.insertAdjacentHTML('beforeend', createEditSugestaoItemRowHTML());
            const newRow = itensContainer.lastElementChild;
            newRow.querySelector('.close-modal').onclick = () => newRow.remove();
        };

        // Salvar
        form.onsubmit = async (e) => {
            e.preventDefault();
            toggleButtonLoading(btnSave, true, 'Salvando...');

            const itens = [];
            let hasError = false;
            form.querySelectorAll('.item-row-edit').forEach(row => {
                const codigo = row.querySelector('.item-codigo').value.trim();
                const quantidade = row.querySelector('.item-quantidade').value;
                if (codigo && quantidade) {
                    itens.push({ codigo, quantidade: parseInt(quantidade, 10) || 1, status: 'atendido' }); // Mantém como atendido
                } else if (codigo || quantidade) {
                    hasError = true;
                }
            });

            if (hasError) {
                showToast('Preencha código e quantidade corretamente.', 'error');
                toggleButtonLoading(btnSave, false, 'Salvar Alterações');
                return;
            }

            const dados = {
                itens: itens,
                observacao_geral: document.getElementById('edit-sug-descricao').value.trim(),
                vendedor: document.getElementById('edit-sug-vendedor').value
            };

            try {
                const id = form.dataset.sugestaoId;
                const res = await fetch(`/api/sugestoes/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(dados)
                });

                if (res.ok) {
                    showToast('Sugestão atualizada!', 'success');
                    modalOverlay.style.display = 'none';
                    carregarDados(true); // Recarrega o histórico
                } else {
                    throw new Error('Falha ao salvar');
                }
            } catch (err) {
                showToast(err.message, 'error');
            } finally {
                toggleButtonLoading(btnSave, false, 'Salvar Alterações');
            }
        };
    }

    carregarDados(true);
}