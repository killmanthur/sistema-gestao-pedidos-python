import { AppState } from './state.js';
import { showToast } from './toasts.js';

// Agora usamos apenas a lógica de limpar no backend via API Flask
export async function clearNotificationsBackend() {
    try {
        const response = await fetch('/api/separacoes/notificacoes', {
            method: 'DELETE'
        });
    } catch (error) {
        console.error("Erro ao limpar notificações:", error);
    }
}

export function initSeparacaoNotifications() {
    // Se você quiser notificações em tempo real para separação, 
    // o ideal é configurar um evento no Socket.io dentro do backend 
    // e ouvir aqui usando AppState.socket.on(...)
}