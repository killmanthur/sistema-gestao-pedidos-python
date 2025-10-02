// static/js/pages/quadro.js
// Responsabilidade: Lógica específica da página do Quadro Ativo.

import { db } from '../firebase.js';
import { criarCardPedido, setupLogModal } from '../ui.js';

function renderizarColuna(container, pedidos, mensagemVazio, isFirstRender = false) {
    if (!container) return;

    if (isFirstRender) {
        container.innerHTML = ''; // Limpa os skeletons apenas na primeira vez
    }

    const cardsExistentes = new Map();
    container.querySelectorAll('.pedido-card').forEach(card => {
        cardsExistentes.set(card.dataset.id, card);
    });

    const idsAtuais = new Set();
    pedidos.forEach(pedido => {
        idsAtuais.add(pedido.id);
        const cardExistente = cardsExistentes.get(pedido.id);
        
        if (cardExistente) {
            // Se o card já existe, criamos uma nova versão para comparar
            const novoCard = criarCardPedido(pedido);
            // Comparamos o HTML para evitar re-renderizações desnecessárias
            if (cardExistente.innerHTML !== novoCard.innerHTML) {
                // MUDANÇA CRÍTICA: Substituímos o nó DOM inteiro em vez de usar .innerHTML
                // Isso preserva os novos event listeners que estão no `novoCard`.
                cardExistente.replaceWith(novoCard);

                // Aciona o flash na nova versão do card
                novoCard.classList.add('flash-update');
                setTimeout(() => {
                    novoCard.classList.remove('flash-update');
                }, 1500);
            }
        } else {
            // Se o card é novo, apenas o adiciona
            const novoCard = criarCardPedido(pedido);
            container.appendChild(novoCard);
        }
    });

    // Remove cards que não existem mais
    cardsExistentes.forEach((card, id) => {
        if (!idsAtuais.has(id)) {
            card.remove();
        }
    });

    if (pedidos.length === 0) {
        container.innerHTML = `<p class="quadro-vazio-msg">${mensagemVazio}</p>`;
    }
}

export function initQuadroPage() {
    setupLogModal();
    const quadroPedidosRua = document.getElementById('quadro-pedidos-rua');
    const quadroOrcamentos = document.getElementById('quadro-orcamentos');
    // Pega a referência do novo campo de filtro
    const filtroInput = document.getElementById('filtro-quadro-ativo');

    if (!quadroPedidosRua || !quadroOrcamentos || !filtroInput) return;

    // Adiciona o listener de evento para o filtro
    filtroInput.addEventListener('input', () => {
        const termoBusca = filtroInput.value.toLowerCase().trim();
        const todosOsCards = document.querySelectorAll('.pedido-card');

        todosOsCards.forEach(card => {
            // Pega todo o texto de dentro do card para a busca
            const textoCard = card.innerText.toLowerCase();
            if (textoCard.includes(termoBusca)) {
                card.style.display = ''; // Mostra o card se o texto corresponder
            } else {
                card.style.display = 'none'; // Esconde o card se não corresponder
            }
        });
    });

    // Coloca os skeletons no HTML para o carregamento inicial
    quadroPedidosRua.innerHTML = `<div class="skeleton-card"><div class="skeleton-line title"></div><div class="skeleton-line medium"></div></div>`;
    quadroOrcamentos.innerHTML = `<div class="skeleton-card"><div class="skeleton-line title"></div><div class="skeleton-line medium"></div></div>`;

    const pedidosRef = db.ref('pedidos');
    const audioNotificacao = new Audio('/static/notification.mp3');
    let knownActiveIds = new Set();
    let isFirstLoad = true;
    
    pedidosRef.orderByChild('status').on('value', (pedidosSnapshot) => {
        const todosPedidos = pedidosSnapshot.val() || {};
        const pedidosArray = Object.entries(todosPedidos).map(([id, data]) => ({ id, ...data }));
        
        const pedidosAtivos = pedidosArray.filter(p => p.status !== 'OK');

        const pedidosDeProduto = pedidosAtivos
            .filter(p => p.tipo_req === 'Pedido Produto')
            .sort((a, b) => new Date(b.data_criacao) - new Date(a.data_criacao));
            
        const pedidosDeOrcamento = pedidosAtivos
            .filter(p => p.tipo_req === 'Atualização Orçamento')
            .sort((a, b) => new Date(b.data_criacao) - new Date(a.data_criacao));

        renderizarColuna(quadroPedidosRua, pedidosDeProduto, "Nenhum pedido de rua ativo.", isFirstLoad);
        renderizarColuna(quadroOrcamentos, pedidosDeOrcamento, "Nenhuma atualização de orçamento ativa.", isFirstLoad);

        // Lógica de Som para novos cards
        if (isFirstLoad) {
            pedidosAtivos.forEach(p => knownActiveIds.add(p.id));
            isFirstLoad = false;
        } else {
            const currentActiveIds = new Set(pedidosAtivos.map(p => p.id));
            if (window.location.pathname.includes('/quadro')) {
                currentActiveIds.forEach(id => {
                    if (!knownActiveIds.has(id)) {
                        audioNotificacao.currentTime = 0;
                        audioNotificacao.play().catch(e => console.log("Interação do usuário necessária para tocar som."));
                    }
                });
            }
            knownActiveIds = currentActiveIds;
        }
    }, (error) => {
        console.error("Erro no listener do Firebase (Quadro Ativo):", error);
        // Usamos showToast aqui, que deve ser importado se ainda não estiver
        // import { showToast } from '../toasts.js'; // Adicione se necessário
        showToast("Não foi possível conectar ao banco de dados em tempo real.", "error");
    });
}