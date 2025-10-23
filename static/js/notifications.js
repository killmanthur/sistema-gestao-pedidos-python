// static/js/notifications.js
import { AppState } from './state.js';

let notificationInterval = null;
let lastNotificationCount = 0;
let audioUnlocked = false;
const notificationSound = new Audio('/static/notification.mp3'); // Certifique-se de que este arquivo de som exista!

const elements = {
    bell: document.getElementById('notification-bell'),
    count: document.getElementById('notification-count'),
    panel: document.getElementById('notification-panel'),
    list: document.getElementById('notification-list'),
    clearBtn: document.getElementById('btn-clear-notifications'),
};

function unlockAudio() {
    if (audioUnlocked) return;
    notificationSound.play().then(() => {
        notificationSound.pause();
        notificationSound.currentTime = 0;
        audioUnlocked = true;
        console.log("Contexto de áudio desbloqueado pelo usuário.");
        // Remove o listener para não rodar novamente
        document.body.removeEventListener('click', unlockAudio);
        document.body.removeEventListener('keydown', unlockAudio);
    }).catch(e => {
        // O erro inicial é esperado se o usuário ainda não interagiu
    });
}
// Adiciona listeners para o primeiro clique ou tecla pressionada
document.body.addEventListener('click', unlockAudio);
document.body.addEventListener('keydown', unlockAudio);

function renderNotifications(notifications) {
    elements.list.innerHTML = '';
    if (notifications.length === 0) {
        elements.list.innerHTML = '<li>Nenhuma notificação nova.</li>';
        return;
    }

    notifications.forEach(notif => {
        const li = document.createElement('li');
        if (!notif.lida) {
            li.classList.add('unread');
        }

        let content;
        if (notif.link) {
            content = `<a href="${notif.link}">${notif.mensagem}</a>`;
        } else {
            content = `<span>${notif.mensagem}</span>`;
        }
        li.innerHTML = content;
        elements.list.appendChild(li);
    });
}

async function fetchNotifications() {
    if (!AppState.currentUser || !AppState.currentUser.isLoggedIn) {
        return;
    }
    const userId = AppState.currentUser.data.uid;

    try {
        const response = await fetch(`/api/notificacoes/${userId}`);
        if (!response.ok) return;

        const notifications = await response.json();
        const unreadCount = notifications.filter(n => !n.lida).length;

        // Atualiza o contador na tela
        if (unreadCount > 0) {
            elements.count.textContent = unreadCount;
            elements.count.style.display = 'block';
        } else {
            elements.count.style.display = 'none';
        }

        // TOCA O SOM se o número de notificações não lidas aumentou
        if (unreadCount > lastNotificationCount && audioUnlocked) { // <-- ADICIONA A VERIFICAÇÃO 'audioUnlocked'
            notificationSound.play().catch(e => console.warn("Não foi possível tocar o som:", e));
        }
        lastNotificationCount = unreadCount;

        // Renderiza a lista
        renderNotifications(notifications);

    } catch (error) {
        console.error("Erro ao buscar notificações:", error);
    }
}

async function markNotificationsAsRead() {
    const userId = AppState.currentUser.data.uid;
    try {
        await fetch(`/api/notificacoes/${userId}/mark-as-read`, { method: 'POST' });
        // Otimização: limpa a UI imediatamente, sem esperar o próximo polling
        elements.count.style.display = 'none';
        lastNotificationCount = 0;
        elements.list.querySelectorAll('li.unread').forEach(li => li.classList.remove('unread'));
    } catch (error) {
        console.error("Erro ao marcar notificações como lidas:", error);
    }
}


export function setupNotifications() {
    if (!elements.bell) return;

    elements.bell.addEventListener('click', (e) => {
        e.stopPropagation();
        const isVisible = elements.panel.style.display === 'block';
        elements.panel.style.display = isVisible ? 'none' : 'block';

        // Se abriu o painel e tinha notificações, marca como lidas
        if (!isVisible && lastNotificationCount > 0) {
            markNotificationsAsRead();
        }
    });

    elements.clearBtn.addEventListener('click', markNotificationsAsRead);

    // Fecha o painel se clicar fora
    document.addEventListener('click', (e) => {
        if (!elements.panel.contains(e.target) && e.target !== elements.bell) {
            elements.panel.style.display = 'none';
        }
    });

    // Inicia o polling
    if (notificationInterval) clearInterval(notificationInterval);
    fetchNotifications(); // Busca a primeira vez imediatamente
    notificationInterval = setInterval(fetchNotifications, 5000); // Depois a cada 20 segundos
}