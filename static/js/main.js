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
import { initPendenciasEAlteracoesPage } from './pages/pendencias_e_alteracoes.js'; 
import { initGerenciarSeparacoesPage } from './pages/gerenciar-separacoes.js';
import { initDashboardLogisticaPage } from './pages/dashboard-logistica.js';
import { setupNotifications } from './notifications.js';

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
    if (path.includes('/admin/sistema')) initAdminSistemaPage();
    else if (path.includes('/inicio')) initInicioPage();
    else if (path.includes('/quadro')) initQuadroPage();
    else if (path.includes('/historico')) initHistoricoPage();
    else if (path.includes('/sugestoes')) initSugestoesPage();
    else if (path.includes('/criar-pedido')) initCriarPedidoPage();
    else if (path.includes('/atualizacao-orcamento')) initAtualizacaoOrcamentoPage();
    else if (path.includes('/dashboard-logistica')) initDashboardLogisticaPage(); // ****** NOVA LINHA ******
    else if (path.includes('/dashboard')) initDashboardPage();
    else if (path.includes('/separacoes')) initSeparacoesPage();
    else if (path.includes('/conferencias')) initConferenciasPage();
    else if (path.includes('/recebimento')) initRecebimentoPage();
    else if (path.includes('/pendencias-e-alteracoes')) initPendenciasEAlteracoesPage(); // ROTA ATUALIZADA
    else if (path.includes('/gerenciar-separacoes')) initGerenciarSeparacoesPage();

}

export function initializePublicApp() {
    setupUI();
    initLoginPage();
}

document.addEventListener('DOMContentLoaded', () => {
    console.log("DEBUG: DOMContentLoaded acionado. Iniciando aplicação.");
    initializeTheme();
    setupAuthObserver();
});