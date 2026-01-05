// static/js/notifications.js
import { AppState } from './state.js';

let notificationInterval = null;
let lastNotificationCount = 0;
let audioUnlocked = false;
const notificationSound = new Audio('/static/notification.mp3');

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
        
        document.body.removeEventListener('click', unlockAudio);
        document.body.removeEventListener('keydown', unlockAudio);
    }).catch(e => { });
}
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
        let content = notif.link ? `<a href="${notif.link}">${notif.mensagem}</a>` : `<span>${notif.mensagem}</span>`;
        li.innerHTML = content;
        elements.list.appendChild(li);
    });
}

async function fetchNotifications() {
    if (!AppState.currentUser || !AppState.currentUser.isLoggedIn) return;
    const userId = AppState.currentUser.data.uid;

    try {
        const response = await fetch(`/api/notificacoes/${userId}`);
        if (!response.ok) return;

        const notifications = await response.json();

        // Filtra apenas as não lidas para a badge
        const unreadCount = notifications.filter(n => !n.lida).length;

        // Atualiza a Badge
        if (unreadCount > 0) {
            elements.count.textContent = unreadCount > 99 ? '99+' : unreadCount;
            elements.count.style.display = 'flex'; // 'flex' para centralizar texto, definido no CSS

            // Tocar som se houver NOVAS notificações (mais do que antes)
            if (unreadCount > lastNotificationCount && audioUnlocked) {
                notificationSound.play().catch(e => console.warn("Som bloqueado:", e));
            }
        } else {
            elements.count.style.display = 'none';
        }

        lastNotificationCount = unreadCount;
        renderNotifications(notifications); // Renderiza a lista no painel

    } catch (error) {
        console.error("Erro ao buscar notificações:", error);
    }
}

async function markNotificationsAsRead() {
    const userId = AppState.currentUser.data.uid;
    try {
        await fetch(`/api/notificacoes/${userId}/mark-as-read`, { method: 'POST' });
        elements.count.style.display = 'none';
        lastNotificationCount = 0;
        elements.list.querySelectorAll('li.unread').forEach(li => li.classList.remove('unread'));
    } catch (error) {
        console.error("Erro ao marcar notificações como lidas:", error);
    }
}

// --- INÍCIO DA NOVA FUNÇÃO ---
async function clearAllNotifications() {
    const userId = AppState.currentUser.data.uid;
    try {
        const response = await fetch(`/api/notificacoes/${userId}/clear-all`, { method: 'DELETE' });
        if (!response.ok) {
            throw new Error('Falha ao limpar as notificações no servidor.');
        }

        // Otimização: limpa a UI imediatamente sem esperar o próximo polling
        elements.count.style.display = 'none';
        lastNotificationCount = 0;
        elements.list.innerHTML = '<li>Nenhuma notificação nova.</li>';

        // Fecha o painel após a limpeza
        elements.panel.style.display = 'none';

    } catch (error) {
        console.error("Erro ao limpar todas as notificações:", error);
        // Opcional: Adicionar um toast de erro para o usuário
    }
}
// --- FIM DA NOVA FUNÇÃO ---


// --- FUNÇÃO `setupNotifications` ATUALIZADA ---
export function setupNotifications() {
    if (!elements.bell) return;

    elements.bell.addEventListener('click', (e) => {
        e.stopPropagation();
        const isVisible = elements.panel.style.display === 'block';
        elements.panel.style.display = isVisible ? 'none' : 'block';

        if (!isVisible && lastNotificationCount > 0) {
            markNotificationsAsRead();
        }
    });

    // Ação do botão "Limpar Tudo" agora chama a nova função
    elements.clearBtn.addEventListener('click', clearAllNotifications);

    document.addEventListener('click', (e) => {
        if (!elements.panel.contains(e.target) && e.target !== elements.bell) {
            elements.panel.style.display = 'none';
        }
    });

    if (notificationInterval) clearInterval(notificationInterval);
    fetchNotifications();
    notificationInterval = setInterval(fetchNotifications, 5000);
}