let pollingInterval = null;
import { AppState } from '../state.js';

function createTvCard(separacao) {
    const card = document.createElement('div');
    card.className = 'tv-card';

    // Adiciona uma classe para animação de entrada
    card.classList.add('fade-in');

    card.innerHTML = `
        <div class="tv-card__mov">
            <span class="label">MOV</span>
            <span class="number">${separacao.numero_movimentacao}</span>
        </div>
        <div class="tv-card__client">
            ${separacao.nome_cliente}
        </div>
    `;
    return card;
}

async function fetchAndRenderTvData() {
    try {
        // 1. Busca as ativas (Separação e Conferência)
        const resAtivas = await fetch('/api/separacoes/ativas');
        const ativas = await resAtivas.json();

        // 2. Busca as recentes finalizadas
        const resFinalizadas = await fetch('/api/separacoes/recentes-finalizadas');
        const finalizadas = await resFinalizadas.json();

        // Filtra as ativas
        const emSeparacao = ativas.filter(s => s.status === 'Em Separação');
        const emConferencia = ativas.filter(s => s.status === 'Em Conferência');

        // Renderiza as 3 colunas
        renderColumn('list-separacao', 'count-separacao', emSeparacao, 'desc'); // Mais novos primeiro
        renderColumn('list-conferencia', 'count-conferencia', emConferencia, 'asc'); // Mais antigos primeiro (prioridade)
        renderColumn('list-finalizado', 'count-finalizado', finalizadas, 'none'); // Ordem do banco (já vem por data)

    } catch (error) {
        console.error("Erro ao atualizar TV:", error);
    }
}

function renderColumn(containerId, countId, items, order) {
    const container = document.getElementById(containerId);
    const countBadge = document.getElementById(countId);
    if (!container) return;

    if (countBadge) countBadge.textContent = items.length;
    container.innerHTML = '';

    if (items.length === 0) {
        container.innerHTML = '<div class="tv-empty-state">Aguardando...</div>';
        return;
    }

    // Lógica de ordenação opcional
    if (order === 'asc') items.sort((a, b) => a.id - b.id);
    if (order === 'desc') items.sort((a, b) => b.id - a.id);

    items.forEach(item => {
        const card = document.createElement('div');
        card.className = 'tv-card';
        card.innerHTML = `
            <div class="tv-card__mov">
                <span class="label">MOV</span>
                <span class="number">${item.numero_movimentacao}</span>
            </div>
            <div class="tv-card__client">
                ${item.nome_cliente}
            </div>
        `;
        container.appendChild(card);
    });
}

export function initTvExpedicaoPage() {
    document.body.classList.add('dark-mode');
    fetchAndRenderTvData(); // Carga inicial

    if (AppState.socket) {
        // A TV atualiza para QUALQUER evento logístico
        const updateLogistics = () => {
            console.log("Evento logístico detectado, atualizando painel...");
            fetchAndRenderTvData();
        };

        AppState.socket.on('nova_separacao', updateLogistics);
        AppState.socket.on('separacao_atualizada', updateLogistics);
        AppState.socket.on('status_separacao_atualizado', updateLogistics);
        AppState.socket.on('conferencia_iniciada', updateLogistics);
        AppState.socket.on('conferencia_finalizada', updateLogistics);
    }
}