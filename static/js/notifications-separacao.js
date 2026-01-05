// static/js/notifications-separacao.js
import { db, auth } from './firebase.js';
import { AppState } from './state.js';
import { showToast } from './toasts.js';

let isInitialDataLoaded = false;
let previousRelevantNotificationCount = 0; // MUDANÇA: Renomeado para clareza
const notificationSound = new Audio('/static/notification.mp3');

/** Atualiza a badge de notificação no menu */
function updateBadge(count) {
    const badge = document.getElementById('separacoes-notification-badge');
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
        new Notification('Nova Atividade em Separações', {
            body: message,
            icon: '/static/favicon.ico'
        });
    }
}

/** Limpa as notificações no backend */
export async function clearNotificationsBackend() {
    try {
        const idToken = await auth.currentUser.getIdToken();
        const response = await fetch('/api/separacoes/notificacoes', {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${idToken}` }
        });
        if (!response.ok) {
            console.error("Falha ao limpar notificações no servidor.");
        }
    } catch (error) {
        console.error("Erro ao tentar limpar notificações:", error);
    }
}

/** Inicializa o listener do Firebase e os eventos de clique */
export function initSeparacaoNotifications() {
    if (!AppState.currentUser.isLoggedIn) return;

    if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                showToast('Notificações de separação ativadas!', 'success');
            }
        });
    }

    const uid = AppState.currentUser.data.uid;
    const notificationsRef = db.ref(`notificacoes_separacao/${uid}`);

    notificationsRef.on('value', (snapshot) => {
        const allNotificationsObject = snapshot.val() || {};

        // --- LÓGICA DE CORREÇÃO PRINCIPAL ---
        // 1. Converte o objeto de notificações em uma lista
        const allNotificationsList = Object.values(allNotificationsObject);

        // 2. Filtra a lista para remover notificações criadas pelo próprio usuário
        const relevantNotifications = allNotificationsList.filter(
            notif => notif.autor !== AppState.currentUser.nome
        );

        // 3. A contagem para a badge agora é baseada APENAS nas notificações relevantes
        const relevantCount = relevantNotifications.length;

        updateBadge(relevantCount);

        // 4. A lógica de som/popup também usa a contagem relevante
        if (isInitialDataLoaded && relevantCount > previousRelevantNotificationCount) {
            const lastRelevantNotification = relevantNotifications[relevantNotifications.length - 1];

            notificationSound.currentTime = 0;
            notificationSound.play().catch(e => console.warn("Interação necessária para tocar som."));

            showSystemNotification(lastRelevantNotification.mensagem);
        }

        previousRelevantNotificationCount = relevantCount; // Atualiza a contagem relevante anterior
        if (!isInitialDataLoaded) {
            isInitialDataLoaded = true;
        }
    });

    const separacoesLink = document.querySelector('.nav-item[data-page="separacoes"] a');
    if (separacoesLink) {
        separacoesLink.addEventListener('click', (e) => {
            if (window.location.pathname.includes('/separacoes')) {
                if (previousRelevantNotificationCount > 0) {
                    clearNotificationsBackend();
                }
                return;
            }
            e.preventDefault();
            clearNotificationsBackend();
            window.location.href = separacoesLink.href;
        });
    }

    if (window.location.pathname.includes('/separacoes')) {
        clearNotificationsBackend();
    }
}