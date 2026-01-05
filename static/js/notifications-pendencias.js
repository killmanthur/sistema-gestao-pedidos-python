// static/js/notifications-pendencias.js
import { db, auth } from './firebase.js';
import { AppState } from './state.js';
import { showToast } from './toasts.js';

let isInitialDataLoaded = false;
let previousNotificationCount = 0;
const notificationSound = new Audio('/static/notification.mp3');

/** Atualiza a badge de notificação no menu */
function updateBadge(count) {
    const badge = document.getElementById('pendencias-notification-badge');
    if (!badge) return;

    if (count > 0) {
        badge.textContent = count;
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }
}

/** Exibe uma notificação nativa do sistema operacional */
function showSystemNotification(message) {
    if (Notification.permission === 'granted') {
        new Notification('Nova Atividade em Pendências', {
            body: message,
            icon: '/static/favicon.ico'
        });
    }
}

/** Limpa as notificações no backend */
export async function clearPendenciasNotificationsBackend() {
    try {
        const idToken = await auth.currentUser.getIdToken();
        const response = await fetch('/api/conferencias/pendencias/notificacoes', {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${idToken}` }
        });
        if (!response.ok) {
            console.error("Falha ao limpar notificações de pendências no servidor.");
        }
    } catch (error) {
        console.error("Erro ao tentar limpar notificações de pendências:", error);
    }
}

/** Inicializa o listener do Firebase e os eventos de clique */
export function initPendenciasNotifications() {
    if (!AppState.currentUser.isLoggedIn) return;

    const uid = AppState.currentUser.data.uid;
    // Escuta o novo caminho no Firebase
    const notificationsRef = db.ref(`notificacoes_pendencias/${uid}`);

    notificationsRef.on('value', (snapshot) => {
        const allNotificationsObject = snapshot.val() || {};
        const relevantNotifications = Object.values(allNotificationsObject).filter(
            notif => notif.autor !== AppState.currentUser.nome
        );

        const count = relevantNotifications.length;
        updateBadge(count);

        if (isInitialDataLoaded && count > previousNotificationCount) {
            const lastNotification = relevantNotifications[relevantNotifications.length - 1];
            notificationSound.currentTime = 0;
            notificationSound.play().catch(e => console.warn("Interação necessária para tocar som."));
            showSystemNotification(lastNotification.mensagem);
        }

        previousNotificationCount = count;
        if (!isInitialDataLoaded) {
            isInitialDataLoaded = true;
        }
    });

    const pendenciasLink = document.querySelector('.nav-item[data-page="pendencias_e_alteracoes"] a');
    if (pendenciasLink) {
        pendenciasLink.addEventListener('click', (e) => {
            if (window.location.pathname.includes('/pendencias-e-alteracoes')) {
                if (previousNotificationCount > 0) {
                    clearPendenciasNotificationsBackend();
                }
                return;
            }
            e.preventDefault();
            clearPendenciasNotificationsBackend();
            window.location.href = pendenciasLink.href;
        });
    }

    if (window.location.pathname.includes('/pendencias-e-alteracoes')) {
        clearPendenciasNotificationsBackend();
    }
}