// static/js/pages/quadro.js
import { showToast } from '../toasts.js';
import { criarCardPedido, setupLogModal } from '../ui.js';

let quadroPedidosRua, quadroOrcamentos, filtroInput, activePedidos = [], intervalId = null;

function renderizarColunasComFiltro() {
    if (!quadroPedidosRua || !quadroOrcamentos) return;

    const termoBusca = filtroInput.value.toLowerCase().trim();

    const filtrar = (pedidos) => {
        if (!termoBusca) return pedidos;
        return pedidos.filter(p => {
            const textoCard = [
                p.vendedor, p.comprador, p.tipo_req, p.codigo, p.código, p.observacao_geral, p.descricao,
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

async function fetchActivePedidos() {
    try {
        const response = await fetch('/api/pedidos/ativos');
        if (!response.ok) {
            throw new Error('Falha ao buscar dados do quadro.');
        }
        activePedidos = await response.json();
        renderizarColunasComFiltro();
    } catch (error) {
        console.error("Erro ao buscar pedidos ativos:", error);
        showToast(error.message, "error");
        // Para de tentar se der erro para não sobrecarregar
        if (intervalId) clearInterval(intervalId);
    }
}

export function initQuadroPage() {
    setupLogModal();
    quadroPedidosRua = document.getElementById('quadro-pedidos-rua');
    quadroOrcamentos = document.getElementById('quadro-orcamentos');
    filtroInput = document.getElementById('filtro-quadro-ativo');

    if (!quadroPedidosRua || !quadroOrcamentos || !filtroInput) return;

    filtroInput.addEventListener('input', renderizarColunasComFiltro);

    // Limpa qualquer intervalo anterior ao (re)iniciar a página
    if (intervalId) clearInterval(intervalId);

    // Carregamento inicial
    quadroPedidosRua.innerHTML = `<div class="spinner" style="margin: 2rem auto;"></div>`;
    quadroOrcamentos.innerHTML = `<div class="spinner" style="margin: 2rem auto;"></div>`;
    fetchActivePedidos();

    // Inicia a atualização periódica
    intervalId = setInterval(fetchActivePedidos, 15000); // Atualiza a cada 15 segundos
    window.initQuadroPage = initQuadroPage;
}