// static/js/pages/pedidos_a_caminho.js
import { AppState } from '../state.js';
import { showToast } from '../toasts.js';
import { criarCardPedido, setupLogModal } from '../ui.js';

let quadroContainer, filtroInput;
let aCaminhoPedidos = [];

function renderizarPedidos() {
    quadroContainer.innerHTML = '';
    const termoBusca = filtroInput.value.toLowerCase().trim();

    const pedidosFiltrados = aCaminhoPedidos.filter(p => {
        if (!termoBusca) return true;
        const textoCard = [p.vendedor, p.comprador, p.codigo, p.código, ...(p.itens || []).map(i => i.codigo)].join(' ').toLowerCase();
        return textoCard.includes(termoBusca);
    });

    if (pedidosFiltrados.length === 0) {
        quadroContainer.innerHTML = `<p class="quadro-vazio-msg">Nenhum pedido a caminho encontrado.</p>`;
    } else {
        pedidosFiltrados.forEach(pedido => {
            quadroContainer.appendChild(criarCardPedido(pedido));
        });
    }
}

async function fetchACaminhoPedidos() {
    try {
        // --- INÍCIO DA ALTERAÇÃO ---
        const { role, nome } = AppState.currentUser;
        const params = new URLSearchParams({
            user_role: role || '',
            user_name: nome || ''
        });

        const response = await fetch(`/api/pedidos/a-caminho?${params.toString()}`);
        // --- FIM DA ALTERAÇÃO ---

        if (!response.ok) throw new Error('Falha ao buscar pedidos a caminho.');
        aCaminhoPedidos = await response.json();
        renderizarPedidos();
    } catch (error) {
        console.error("Erro:", error);
        showToast(error.message, "error");
        quadroContainer.innerHTML = `<p class="quadro-vazio-msg" style="color: var(--clr-danger);">Erro ao carregar dados.</p>`;
    }
}

export function initPedidosACaminhoPage() {
    setupLogModal();
    quadroContainer = document.getElementById('quadro-pedidos-a-caminho-container');
    filtroInput = document.getElementById('filtro-pedidos-a-caminho');

    if (!quadroContainer || !filtroInput) return;

    filtroInput.addEventListener('input', renderizarPedidos);

    quadroContainer.innerHTML = `<div class="spinner" style="margin: 2rem auto;"></div>`;

    fetchACaminhoPedidos();

    // Exporta a função de recarregamento para ser usada globalmente se necessário
    window.initPedidosACaminhoPage = fetchACaminhoPedidos;
}