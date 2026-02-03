// static/js/main.js
import { AppState } from './state.js';
import { setupAuthObserver, handleLogout, initLoginPage } from './auth.js';
import { setupEditModal, initializeTheme, setupLogModal, setupAllModalCloseHandlers, setupUI } from './ui.js';
import { initQuadroPage } from './pages/quadro.js';
import { initHistoricoPage } from './pages/historico.js';
import { initSugestoesPage } from './pages/sugestoes.js';
import { initCriarPedidoPage } from './pages/criar-pedido.js';
import { initAtualizacaoOrcamentoPage } from './pages/atualizacao-orcamento.js';
import { initDashboardPage } from './pages/dashboard.js';
import { initAdminSistemaPage } from './pages/admin-sistema.js';
import { initInicioPage } from './pages/inicio.js';
import { initSeparacoesPage } from './pages/separacoes.js';
import { initConferenciasPage } from './pages/conferencias.js';
import { initRecebimentoPage } from './pages/recebimento.js';
import { initGerenciarSeparacoesPage } from './pages/gerenciar-separacoes.js';
import { initDashboardLogisticaPage } from './pages/dashboard-logistica.js';
import { initLixeiraPage } from './pages/lixeira.js';
import { initHistoricoConferenciasPage } from './pages/historico-conferencias.js';
import { initDashboardConferenciasPage } from './pages/dashboard-conferencias.js';
import { initPedidosACaminhoPage } from './pages/pedidos_a_caminho.js';
import { setupNotifications } from './notifications.js';
import { initTvExpedicaoPage } from './pages/tv_expedicao.js';
import { initRegistroComprasPage } from './pages/registro_compras.js';
import { initPendenciasEAlteracoesPage } from './pages/pendencias_e_alteracoes.js';
import { initHistoricoSugestoesPage } from './pages/historico-sugestoes.js';

// 1. Inicializa o socket
const socket = io({
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000
});

AppState.socket = socket;

// 2. Garante que o JOIN aconteça sempre que a conexão for estabelecida
socket.on('connect', () => {
    console.log("Conectado ao servidor Socket.io");
    if (AppState.currentUser && AppState.currentUser.isLoggedIn) {
        const uid = AppState.currentUser.data.uid;
        socket.emit('join', { user_id: uid });
        console.log(`Solicitado ingresso na sala privada: ${uid}`);
    }
});

if (AppState.socket && AppState.currentUser.isLoggedIn) {
    const userId = AppState.currentUser.data.uid;
    // Avisa o servidor para nos colocar na nossa sala privada
    AppState.socket.emit('join', { user_id: userId });
}

async function fetchInitialData() {
    try {
        const response = await fetch('/api/usuarios/comprador-nomes');
        if (response.ok) {
            AppState.compradorNomes = await response.json();
        }
    } catch (error) {
        console.error("Erro ao buscar nomes de compradores:", error);
    }
}

export async function initializeAuthenticatedApp() {
    if (AppState.isAppInitialized) {
        return;
    }
    AppState.isAppInitialized = true;

    await fetchInitialData();

    handleLogout();
    setupAllModalCloseHandlers();
    setupEditModal();
    setupLogModal();
    setupNotifications();

    const path = window.location.pathname;

    if (path.includes('/historico-conferencias')) {
        initHistoricoConferenciasPage();
    }
    else if (path.includes('/historico-sugestoes')) {
        initHistoricoSugestoesPage();
    }
    else if (path.includes('/tv-expedicao')) {
        initTvExpedicaoPage();
    }
    // --- LÓGICA DE INICIALIZAÇÃO DA NOVA PÁGINA ---
    else if (path.includes('/pedidos-a-caminho')) {
        initPedidosACaminhoPage();
    }
    // --- FIM DA LÓGICA ---
    else if (path.includes('/admin/sistema')) {
        initAdminSistemaPage();
    }
    else if (path.includes('/inicio')) {
        initInicioPage();
    }
    else if (path.includes('/quadro')) {
        initQuadroPage();
    }
    else if (path.includes('/historico')) {
        initHistoricoPage();
    }
    else if (path.includes('/sugestoes')) {
        initSugestoesPage();
    }
    else if (path.includes('/criar-pedido')) {
        initCriarPedidoPage();
    }
    else if (path.includes('/pendencias-e-alteracoes')) {
        initPendenciasEAlteracoesPage();
    }
    else if (path.includes('/atualizacao-orcamento')) {
        initAtualizacaoOrcamentoPage();
    }
    else if (path.includes('/dashboard-logistica')) {
        initDashboardLogisticaPage();
    }
    else if (path.includes('/dashboard-conferencias')) {
        initDashboardConferenciasPage();
    }
    else if (path.includes('/dashboard')) {
        initDashboardPage();
    }
    else if (path.includes('/separacoes')) {
        initSeparacoesPage();
    }
    else if (path.includes('/conferencias')) {
        initConferenciasPage();
    }
    else if (path.includes('/recebimento')) {
        initRecebimentoPage();
    }
    else if (path.includes('/gerenciar-separacoes')) {
        initGerenciarSeparacoesPage();
    }
    else if (path.includes('/lixeira')) {
        initLixeiraPage();
    }
    else if (path.includes('/registro-compras')) {
        initRegistroComprasPage();
    }
}

export function initializePublicApp() {
    setupUI();
    initLoginPage();
}

document.addEventListener('DOMContentLoaded', () => {
    initializeTheme();
    setupAuthObserver();
});