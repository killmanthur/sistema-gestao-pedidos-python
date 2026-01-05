// static/js/audio-notifications.js
// Responsabilidade: Gerenciar todas as notificações de áudio da aplicação,
// começando com as mensagens de chat.

import { db } from './firebase.js';
import { AppState } from './state.js';

// Define o som que será usado. Pode ser trocado facilmente aqui no futuro.
const chatSound = new Audio('/static/notification.mp3');

/**
 * Anexa um listener a um chat específico para tocar som em novas mensagens.
 * @param {string} pedidoId - O ID do pedido (e do chat).
 */
function listenToChatForSound(pedidoId) {
    const chatRef = db.ref(`chats/${pedidoId}`);
    let isInitialDataLoaded = false; // Flag para ignorar mensagens antigas no carregamento

    // 'child_added' é disparado para cada mensagem existente e para cada nova que chega.
    chatRef.on('child_added', (messageSnapshot) => {
        // Ignoramos a "leva" inicial de mensagens que o listener carrega.
        if (!isInitialDataLoaded) {
            return;
        }

        const message = messageSnapshot.val();
        
        // A CONDIÇÃO PRINCIPAL:
        // Toca o som apenas se a mensagem existir E o remetente NÃO for o usuário atual.
        if (message && message.remetente !== AppState.currentUser.nome) {
            console.log(`Nova mensagem recebida no pedido ${pedidoId}. Tocando som.`);
            chatSound.currentTime = 0;
            chatSound.play().catch(error => {
                // Navegadores modernos podem bloquear a reprodução automática de áudio.
                // Este log ajuda a depurar isso.
                console.error("Falha ao tocar áudio da notificação:", error);
            });
        }
    });

    // Usamos `once('value')` para saber quando a carga inicial terminou.
    // Depois que ele roda, qualquer evento 'child_added' será 100% uma nova mensagem.
    chatRef.once('value', () => {
        isInitialDataLoaded = true;
    });
}


/**
 * Função principal que encontra todos os chats relevantes para o usuário
 * e anexa os listeners de notificação sonora.
 */
export function setupChatSoundNotifications() {
    if (!AppState.currentUser.isLoggedIn || !AppState.currentUser.nome) {
        return;
    }

    const currentUser = AppState.currentUser.nome;
    const pedidosRef = db.ref('pedidos');

    // Busca todos os pedidos para encontrar em quais o usuário está envolvido.
    pedidosRef.once('value', (snapshot) => {
        const allPedidos = snapshot.val() || {};

        console.log("Verificando pedidos para notificações de som...");

        Object.entries(allPedidos).forEach(([pedidoId, pedidoData]) => {
            // Um pedido é relevante se não estiver finalizado E o usuário for o vendedor ou o comprador.
            const isUserInvolved = 
                pedidoData.status !== 'OK' &&
                (pedidoData.vendedor === currentUser || pedidoData.comprador === currentUser);

            if (isUserInvolved) {
                console.log(`Usuário está envolvido no pedido ativo ${pedidoId}. Anexando listener de som.`);
                listenToChatForSound(pedidoId);
            }
        });
    });
}