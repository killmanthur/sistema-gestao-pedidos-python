import { AppState } from '../state.js';
import { formatarData } from '../ui.js';
import { showToast } from '../toasts.js';

let paginaAtual = 0;
let temMais = true;
let carregando = false;
let termoBusca = '';
let debounceTimer;
let containerCards;
let btnCarregarMais;
let spinner;

// --- NOVA FUNÇÃO: Lógica de Copiar (Idêntica à da página de sugestões) ---
function handleCopySugestao(sugestao) {
    const textoParaCopiar = sugestao.itens.map(item => `${item.quantidade || 1}x ${item.codigo}`).join('\n');

    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(textoParaCopiar)
            .then(() => showToast('Itens copiados!', 'success'))
            .catch(err => {
                console.error('Erro ao copiar:', err);
                showToast('Erro ao copiar itens.', 'error');
            });
    } else {
        // Fallback para navegadores antigos ou sem contexto seguro
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

    // --- MUDANÇA: HTML do Botão de Copiar ---
    const copyBtnHTML = `
        <button class="btn-icon btn-copy-sugestao" title="Copiar Itens" style="width: 28px; height: 28px; margin-left: auto;">
            <img src="/static/copy.svg" alt="Copiar" style="filter: invert(0.5);">
        </button>`;

    // --- MUDANÇA: Inserir o botão no Header ---
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
        </div>
    `;

    // --- MUDANÇA: Adicionar o Listener do Clique ---
    card.querySelector('.btn-copy-sugestao').addEventListener('click', () => handleCopySugestao(sugestao));

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

export function initHistoricoSugestoesPage() {
    containerCards = document.getElementById('container-historico-sugestoes');
    btnCarregarMais = document.getElementById('btn-carregar-mais');
    spinner = document.getElementById('loading-spinner');
    const filtroInput = document.getElementById('filtro-historico-sugestoes');

    if (!containerCards) return;

    btnCarregarMais.onclick = () => carregarDados(false);

    filtroInput.oninput = (e) => {
        clearTimeout(debounceTimer);
        termoBusca = e.target.value.trim();
        debounceTimer = setTimeout(() => carregarDados(true), 500);
    };

    carregarDados(true);
}