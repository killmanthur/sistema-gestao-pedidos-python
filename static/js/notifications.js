// static/js/notifications.js
import { AppState } from './state.js';
import { showToast } from './toasts.js'; // <-- ADICIONADO: Importação que faltava

let lastNotificationCount = 0;
let audioUnlocked = false;
const notificationSound = new Audio('/static/notification.mp3');

// Função para tentar tocar o som
function playNotificationSound() {
    if (audioUnlocked) {
        notificationSound.currentTime = 0;
        notificationSound.play().catch(e => {
            console.warn("Navegador impediu o áudio: Requer interação.");
        });
    } else {
        // Tentativa de tocar mesmo sem flag, alguns browsers permitem após o primeiro som
        console.log("Aviso: O som pode não tocar até que você clique em algo na página.");
    }
}

// Desbloqueia o áudio em qualquer clique ou tecla
function unlockAudio() {
    if (audioUnlocked) return;

    notificationSound.play().then(() => {
        notificationSound.pause();
        notificationSound.currentTime = 0;
        audioUnlocked = true;
        console.log("Sons do sistema: ATIVADOS");

        document.removeEventListener('click', unlockAudio);
        document.removeEventListener('keydown', unlockAudio);
        document.removeEventListener('touchstart', unlockAudio);
    }).catch(e => {
        // Silencioso: continua bloqueado
    });
}

document.addEventListener('click', unlockAudio);
document.addEventListener('keydown', unlockAudio);
document.addEventListener('touchstart', unlockAudio);

function renderNotifications(notifications) {
    const list = document.getElementById('notification-list');
    if (!list) return;

    list.innerHTML = '';
    if (notifications.length === 0) {
        list.innerHTML = '<li>Nenhuma notificação nova.</li>';
        return;
    }

    notifications.forEach(notif => {
        const li = document.createElement('li');
        if (!notif.lida) li.classList.add('unread');

        const content = notif.link
            ? `<a href="${notif.link}">${notif.mensagem}</a>`
            : `<span>${notif.mensagem}</span>`;

        li.innerHTML = content;
        list.appendChild(li);
    });
}

async function fetchNotifications() {
    if (!AppState.currentUser || !AppState.currentUser.isLoggedIn) return;
    const userId = AppState.currentUser.data.uid;

    try {
        const response = await fetch(`/api/notificacoes/${userId}`);
        if (!response.ok) return;
        const notifications = await response.json();

        const unreadCount = notifications.filter(n => !n.lida).length;
        const countEl = document.getElementById('notification-count');

        if (unreadCount > 0) {
            countEl.textContent = unreadCount > 99 ? '99+' : unreadCount;
            countEl.style.display = 'flex';
        } else {
            countEl.style.display = 'none';
        }

        lastNotificationCount = unreadCount;
        renderNotifications(notifications);
    } catch (error) {
        console.error("Erro ao carregar notificações:", error);
    }
}

async function markNotificationsAsRead() {
    const userId = AppState.currentUser.data.uid;
    try {
        await fetch(`/api/notificacoes/${userId}/mark-as-read`, { method: 'POST' });
        const countEl = document.getElementById('notification-count');
        if (countEl) countEl.style.display = 'none';
        lastNotificationCount = 0;
    } catch (e) { console.error(e); }
}

async function clearAllNotifications() {
    if (!AppState.currentUser || !AppState.currentUser.isLoggedIn) return;
    const userId = AppState.currentUser.data.uid;
    try {
        const res = await fetch(`/api/notificacoes/${userId}/clear-all`, { method: 'DELETE' });
        if (res.ok) {
            fetchNotifications();
            showToast("Notificações limpas.", "success");
        }
    } catch (e) { console.error(e); }
}

export function setupNotifications() {
    const bell = document.getElementById('notification-bell');
    const panel = document.getElementById('notification-panel');
    const clearBtn = document.getElementById('btn-clear-notifications');

    if (!bell) return;

    bell.onclick = (e) => {
        e.stopPropagation();
        const isVisible = panel.style.display === 'block';
        panel.style.display = isVisible ? 'none' : 'block';
        if (!isVisible) {
            fetchNotifications();
            if (lastNotificationCount > 0) markNotificationsAsRead();
        }
    };

    if (clearBtn) clearBtn.onclick = (e) => { e.stopPropagation(); clearAllNotifications(); };

    // --- ESCUTA EM TEMPO REAL ---
    if (AppState.socket) {
        AppState.socket.off('nova_notificacao');
        AppState.socket.on('nova_notificacao', (data) => {
            console.log("Nova notificação via Socket!");

            // 1. Toca o som
            playNotificationSound();

            // 2. Atualiza a lista
            fetchNotifications();

            // 3. Mostra o alerta (Agora com import correto)
            showToast(data.mensagem, "info");
        });
    }

    fetchNotifications();
}