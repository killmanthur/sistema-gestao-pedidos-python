// static/js/pages/quadro.js
import { showToast } from '../toasts.js';
import { criarCardPedido, setupLogModal } from '../ui.js';

let quadroPedidosRua, quadroOrcamentos, filtroInput;
let activePedidos = [];
let pollingInterval = null;

// --- LÓGICA DE SINCRONIZAÇÃO (permanece a mesma) ---
let estadoAnterior = { total_ativos: 0, ultimo_update: null };
let audioDesbloqueado = false;
const notificacaoSom = new Audio('/static/notification.mp3');

function tocarSomNotificacao() {
    if (!audioDesbloqueado) return;
    notificacaoSom.play().catch(e => console.error("Erro ao tocar som:", e));
}

function desbloquearAudio() {
    if (audioDesbloqueado) return;
    notificacaoSom.play().then(() => {
        notificacaoSom.pause();
        notificacaoSom.currentTime = 0;
        audioDesbloqueado = true;
        document.removeEventListener('click', desbloquearAudio);
        document.removeEventListener('keydown', desbloquearAudio);
    }).catch(() => { });
}
document.addEventListener('click', desbloquearAudio);
document.addEventListener('keydown', desbloquearAudio);

async function verificarAtualizacoesQuadro() {
    try {
        const response = await fetch('/api/pedidos/status-quadro');
        if (!response.ok) return;
        const estadoAtual = await response.json();

        const mudouTotal = estadoAtual.total_ativos !== estadoAnterior.total_ativos;
        const mudouTimestamp = estadoAtual.ultimo_update !== estadoAnterior.ultimo_update;

        if (mudouTotal || mudouTimestamp) {
            if (estadoAtual.total_ativos > estadoAnterior.total_ativos) {
                tocarSomNotificacao();
            }
            estadoAnterior = estadoAtual;
            await fetchActivePedidos();
        }
    } catch (error) {
        console.error("Erro no polling do quadro:", error);
    }
}


function renderizarColunasComFiltro() {
    if (!quadroPedidosRua || !quadroOrcamentos) return;

    const termoBusca = filtroInput.value.toLowerCase().trim();

    const filtrar = (pedidos) => {
        if (!termoBusca) return pedidos;
        return pedidos.filter(p => {
            const textoCard = [p.vendedor, p.comprador, p.tipo_req, p.codigo, p.código, p.observacao_geral, p.descricao, ...(p.itens || []).map(i => i.codigo)].join(' ').toLowerCase();
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
        if (!response.ok) throw new Error('Falha ao buscar dados do quadro.');
        activePedidos = await response.json();
        renderizarColunasComFiltro();
    } catch (error) {
        console.error("Erro ao buscar pedidos ativos:", error);
        showToast(error.message, "error");
        if (pollingInterval) clearInterval(pollingInterval);
    }
}

export function initQuadroPage() {
    setupLogModal();
    // Voltando a ter apenas 2 referências
    quadroPedidosRua = document.getElementById('quadro-pedidos-rua');
    quadroOrcamentos = document.getElementById('quadro-orcamentos');
    filtroInput = document.getElementById('filtro-quadro-ativo');

    if (!quadroPedidosRua || !quadroOrcamentos || !filtroInput) return;

    filtroInput.addEventListener('input', renderizarColunasComFiltro);

    if (pollingInterval) clearInterval(pollingInterval);

    quadroPedidosRua.innerHTML = `<div class="spinner" style="margin: 2rem auto;"></div>`;
    quadroOrcamentos.innerHTML = `<div class="spinner" style="margin: 2rem auto;"></div>`;

    fetchActivePedidos().then(() => {
        verificarAtualizacoesQuadro();
        pollingInterval = setInterval(verificarAtualizacoesQuadro, 3000);
    });

    window.initQuadroPage = fetchActivePedidos;
}