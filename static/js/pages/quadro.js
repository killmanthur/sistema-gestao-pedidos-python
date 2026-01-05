// static/js/pages/quadro.js
import { AppState } from '../state.js';
import { showToast } from '../toasts.js';
import { criarCardPedido, setupLogModal } from '../ui.js';

let quadroPedidosRua, quadroOrcamentos, filtroInput;
let activePedidos = [];
let pollingInterval = null;

/**
 * Filtra os pedidos carregados localmente e renderiza nas colunas corretas
 */
function renderizarColunasComFiltro() {
    if (!quadroPedidosRua || !quadroOrcamentos) return;

    const termoBusca = filtroInput.value.toLowerCase().trim();

    // Função de filtragem
    const filtrar = (pedidos) => {
        if (!termoBusca) return pedidos;
        return pedidos.filter(p => {
            const textoCard = [
                p.vendedor,
                p.comprador,
                p.tipo_req,
                p.codigo,
                p.código,
                p.observacao_geral,
                p.descricao,
                ...(p.itens || []).map(i => i.codigo)
            ].join(' ').toLowerCase();
            return textoCard.includes(termoBusca);
        });
    };

    const pedidosDeProduto = filtrar(activePedidos.filter(p => p.tipo_req === 'Pedido Produto'));
    const pedidosDeOrcamento = filtrar(activePedidos.filter(p => p.tipo_req === 'Atualização Orçamento'));

    renderizarColuna(quadroPedidosRua, pedidosDeProduto, "Nenhum pedido de rua ativo.");
    renderizarColuna(quadroOrcamentos, pedidosDeOrcamento, "Nenhuma atualização de orçamento ativa.");
}

/**
 * Limpa e preenche uma coluna específica com cards
 */
function renderizarColuna(container, pedidos, mensagemVazio) {
    container.innerHTML = '';
    if (pedidos.length === 0) {
        container.innerHTML = `<p class="quadro-vazio-msg">${mensagemVazio}</p>`;
    } else {
        pedidos.forEach(pedido => {
            container.appendChild(criarCardPedido(pedido));
        });
    }
}

/**
 * Busca os pedidos ativos do servidor
 */
async function fetchActivePedidos() {
    try {
        const { role, nome } = AppState.currentUser;
        const params = new URLSearchParams({
            user_role: role || '',
            user_name: nome || ''
        });

        const response = await fetch(`/api/pedidos/ativos?${params.toString()}`);

        if (!response.ok) throw new Error('Falha ao buscar dados do quadro.');

        activePedidos = await response.json();
        renderizarColunasComFiltro();

    } catch (error) {
        console.error("Erro ao buscar pedidos ativos:", error);
        showToast(error.message, "error");
    }
}

/**
 * Inicialização principal da página de Quadro Ativo
 */
export function initQuadroPage() {
    // Inicializa o modal de logs (histórico)
    setupLogModal();

    // Mapeia elementos do DOM
    quadroPedidosRua = document.getElementById('quadro-pedidos-rua');
    quadroOrcamentos = document.getElementById('quadro-orcamentos');
    filtroInput = document.getElementById('filtro-quadro-ativo');

    if (!quadroPedidosRua || !quadroOrcamentos || !filtroInput) return;

    // --- LOGICA DE ATUALIZAÇÃO AUTOMÁTICA (POLLING) ---
    if (pollingInterval) clearInterval(pollingInterval);

    pollingInterval = setInterval(() => {
        // Verifica se algum modal de edição ou log está aberto
        const modalEditAberto = document.getElementById('edit-modal-overlay')?.style.display === 'flex';
        const modalLogAberto = document.getElementById('log-modal-overlay')?.style.display === 'flex';

        // Só atualiza se o usuário não estiver interagindo com um pedido
        if (!modalEditAberto && !modalLogAberto) {
            console.log("Sincronizando Quadro Ativo...");
            fetchActivePedidos();
        }
    }, 5000); // 20 segundos

    // --- LISTENERS ---
    filtroInput.addEventListener('input', renderizarColunasComFiltro);

    // --- CARREGAMENTO INICIAL ---
    quadroPedidosRua.innerHTML = `<div class="spinner" style="margin: 2rem auto;"></div>`;
    quadroOrcamentos.innerHTML = `<div class="spinner" style="margin: 2rem auto;"></div>`;

    fetchActivePedidos();

    // Exporta para o objeto window para que o salvamento no modal de edição
    // (que está no ui.js) consiga disparar o refresh desta página.
    window.initQuadroPage = fetchActivePedidos;
}