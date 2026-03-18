// static/js/pages/inicio.js
import { AppState } from '../state.js';
import { showToast } from '../toasts.js';

export function initInicioPage() {
    const welcomeMessage = document.getElementById('welcome-message');
    const noAccessMessage = document.getElementById('no-access-message');

    if (!welcomeMessage || !noAccessMessage) return;

    const user = AppState.currentUser;
    if (user && user.isLoggedIn) {
        welcomeMessage.textContent = `Bem-vindo(a), ${user.nome}!`;

        const acessoRestrito = user.accessible_pages?.length === 0 && user.role !== 'Admin';
        if (acessoRestrito) {
            noAccessMessage.style.display = 'block';
        }
    }

    const params = new URLSearchParams(window.location.search);
    if (params.get('acesso_negado') === '1') {
        showToast('Você não tem permissão para acessar essa página.', 'error');
        // Remove o parâmetro da URL sem recarregar a página
        const url = new URL(window.location.href);
        url.searchParams.delete('acesso_negado');
        history.replaceState(null, '', url.toString());
    }
}
