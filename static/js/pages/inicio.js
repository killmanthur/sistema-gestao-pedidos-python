// static/js/pages/inicio.js
import { AppState } from '../state.js';

// Mapeia as chaves de página para seus nomes e URLs
const PAGE_MAP = {
    quadro: { name: "Quadro Ativo", url: "/quadro" },
    historico: { name: "Histórico", url: "/historico" },
    criar_pedido: { name: "Criar Pedido de Rua", url: "/criar-pedido" },
    atualizacao_orcamento: { name: "Atualizar Orçamento", url: "/atualizacao-orcamento" },
    sugestoes: { name: "Sugestão de Compras", url: "/sugestoes" },
    // --- ALTERAÇÃO AQUI ---
    pendencias_e_alteracoes: { name: "Pendências e Alterações", url: "/pendencias-e-alteracoes" }, // Adiciona a nova página
    dashboard: { name: "Dashboard", url: "/dashboard" },
    admin_sistema: { name: "Gerenciar Sistema", url: "/admin/sistema" } // Corrigido para o nome correto da página
};

export function initInicioPage() {
    const welcomeMessage = document.getElementById('welcome-message');
    // ATENÇÃO: O container de links rápidos não existia no seu HTML original,
    // adicione-o em `inicio.html` se quiser usar esta funcionalidade.
    // Exemplo: <div id="quick-links-container" class="quick-links"></div>
    const quickLinksContainer = document.getElementById('quick-links-container');
    const noAccessMessage = document.getElementById('no-access-message');

    if (!welcomeMessage || !noAccessMessage) return;

    const user = AppState.currentUser;
    if (user && user.isLoggedIn) {
        welcomeMessage.textContent = `Bem-vindo(a), ${user.nome}!`;

        let accessiblePages = user.accessible_pages || [];
        if (user.role === 'Admin') {
            accessiblePages = Object.keys(PAGE_MAP); // Admin tem acesso a tudo
        }

        if (quickLinksContainer && accessiblePages.length > 0) {
            quickLinksContainer.innerHTML = ''; // Limpa links antigos
            accessiblePages.forEach(pageKey => {
                const pageInfo = PAGE_MAP[pageKey];
                if (pageInfo) {
                    const link = document.createElement('a');
                    link.href = pageInfo.url;
                    link.className = 'quick-link-btn'; // Uma classe para estilizar os botões
                    link.textContent = pageInfo.name;
                    quickLinksContainer.appendChild(link);
                }
            });
        } else if (accessiblePages.length === 0) {
            if (quickLinksContainer) quickLinksContainer.style.display = 'none';
            noAccessMessage.style.display = 'block';
        }
    }
}