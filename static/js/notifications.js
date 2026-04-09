// static/js/notifications.js
import { AppState } from './state.js';
import { showToast } from './toasts.js'; // <-- ADICIONADO: Importação que faltava

let lastNotificationCount = 0;
let audioUnlocked = false;
const notificationSound = new Audio('/static/notification.mp3');

// --- Tab badge / favicon / title flashing ---
const ORIGINAL_TITLE = document.title;
const ORIGINAL_FAVICON = document.getElementById('favicon-link')?.href || '/static/favicon.ico';
let titleFlashInterval = null;
let faviconImage = null;

function updateTabBadge(count) {
    if (count > 0) {
        document.title = `(${count > 99 ? '99+' : count}) ${ORIGINAL_TITLE}`;
    } else {
        document.title = ORIGINAL_TITLE;
    }
    drawFaviconBadge(count);
}

function drawFaviconBadge(count) {
    const link = document.getElementById('favicon-link');
    if (!link) return;

    if (count <= 0) {
        link.href = ORIGINAL_FAVICON;
        return;
    }

    const draw = (img) => {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, 32, 32);

        // Círculo vermelho no canto inferior direito
        const radius = 11;
        const cx = 32 - radius;
        const cy = 32 - radius;
        ctx.fillStyle = '#dc2626';
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Número
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const text = count > 9 ? '9+' : String(count);
        ctx.fillText(text, cx, cy + 1);

        link.href = canvas.toDataURL('image/png');
    };

    if (faviconImage && faviconImage.complete && faviconImage.naturalWidth > 0) {
        draw(faviconImage);
    } else {
        faviconImage = new Image();
        faviconImage.onload = () => draw(faviconImage);
        faviconImage.onerror = () => {
            // Se falhar, desenha só o círculo sem o favicon original de fundo
            const canvas = document.createElement('canvas');
            canvas.width = 32;
            canvas.height = 32;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#dc2626';
            ctx.beginPath();
            ctx.arc(16, 16, 15, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 18px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(count > 9 ? '9+' : String(count), 16, 17);
            link.href = canvas.toDataURL('image/png');
        };
        faviconImage.src = ORIGINAL_FAVICON;
    }
}

function startTitleFlash() {
    if (titleFlashInterval) return;
    let toggle = false;
    titleFlashInterval = setInterval(() => {
        document.title = toggle
            ? `(${lastNotificationCount}) ${ORIGINAL_TITLE}`
            : `🔔 Nova notificação!`;
        toggle = !toggle;
    }, 1000);
}

function stopTitleFlash() {
    if (titleFlashInterval) {
        clearInterval(titleFlashInterval);
        titleFlashInterval = null;
    }
    updateTabBadge(lastNotificationCount);
}

document.addEventListener('visibilitychange', () => {
    if (!document.hidden) stopTitleFlash();
});

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

        const dataFormatada = formatTimestamp(notif.timestamp);
        const mensagemHTML = notif.link
            ? `<a href="${notif.link}">${notif.mensagem}</a>`
            : `<span>${notif.mensagem}</span>`;

        li.innerHTML = `
            ${mensagemHTML}
            <div class="notification-time">${dataFormatada}</div>
        `;
        list.appendChild(li);
    });
}

function formatTimestamp(ts) {
    if (!ts) return '';
    try {
        const date = new Date(ts);
        if (isNaN(date.getTime())) return '';
        const dd = String(date.getDate()).padStart(2, '0');
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const yyyy = date.getFullYear();
        const hh = String(date.getHours()).padStart(2, '0');
        const min = String(date.getMinutes()).padStart(2, '0');
        return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
    } catch (e) {
        return '';
    }
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
        updateTabBadge(unreadCount);
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
        updateTabBadge(0);
        stopTitleFlash();
    } catch (e) { console.error(e); }
}

function showNativeNotification(mensagem, link) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return false;
    try {
        const notif = new Notification('PyTudo', {
            body: mensagem,
            icon: '/static/favicon.ico',
            tag: 'pytudo-' + Date.now(),
        });
        notif.onclick = () => {
            window.focus();
            if (link) window.location.href = link;
            notif.close();
        };
        setTimeout(() => notif.close(), 8000);
        return true;
    } catch (e) {
        console.warn('Notification API falhou:', e);
        return false;
    }
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
        const isVisible = panel.style.display === 'flex';
        panel.style.display = isVisible ? 'none' : 'flex';
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

            // 3. Aba em background + permissão → pop-up nativo. Senão → toast.
            if (document.hidden && showNativeNotification(data.mensagem, data.link)) {
                // pop-up nativo disparado, não precisa do toast
            } else {
                showToast(data.mensagem, "info");
            }

            // 4. Pisca o título se a aba está em background
            if (document.hidden) {
                startTitleFlash();
            }
        });
    }

    fetchNotifications();
}