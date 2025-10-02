// static/js/pages/inicio.js
import { AppState } from '../state.js';

// Mapeia as chaves de página para seus nomes e URLs
const PAGE_MAP = {
    quadro: { name: "Quadro Ativo", url: "/quadro" },
    historico: { name: "Histórico", url: "/historico" },
    criar_pedido: { name: "Criar Pedido de Rua", url: "/criar-pedido" },
    atualizacao_orcamento: { name: "Atualizar Orçamento", url: "/atualizacao-orcamento" },
    sugestoes: { name: "Sugestão de Compras", url: "/sugestoes" },
    dashboard: { name: "Dashboard", url: "/dashboard" },
    admin_usuarios: { name: "Gerenciar Usuários", url: "/admin/usuarios" }
};

export function initInicioPage() {
    const welcomeMessage = document.getElementById('welcome-message');
    const quickLinksContainer = document.getElementById('quick-links-container');
    const noAccessMessage = document.getElementById('no-access-message');

    if (!welcomeMessage || !quickLinksContainer || !noAccessMessage) return;

    const user = AppState.currentUser;
    if (user && user.isLoggedIn) {
        welcomeMessage.textContent = `Bem-vindo(a), ${user.nome}!`;

        let accessiblePages = user.accessible_pages || [];
        if (user.role === 'Admin') {
            accessiblePages = Object.keys(PAGE_MAP); // Admin tem acesso a tudo
        }

        if (accessiblePages.length > 0) {
            quickLinksContainer.innerHTML = ''; // Limpa links antigos
            accessiblePages.forEach(pageKey => {
                const pageInfo = PAGE_MAP[pageKey];
                if (pageInfo) {
                    const link = document.createElement('a');
                    link.href = pageInfo.url;
                    link.className = 'quick-link-btn';
                    link.textContent = pageInfo.name;
                    quickLinksContainer.appendChild(link);
                }
            });
        } else {
            // Se o usuário não tem nenhuma página acessível
            quickLinksContainer.style.display = 'none';
            noAccessMessage.style.display = 'block';
        }
    }
}