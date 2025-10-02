import { db } from './firebase.js';
import { AppState } from './state.js';
import { openChat } from './chat.js';
import { showToast } from './toasts.js';
import { showConfirmModal } from './ui.js'; // Importa a nova função

function renderNotifications(notificacoes) {
    const list = document.getElementById('notification-list');
    list.innerHTML = '';

    if (notificacoes.length === 0) {
        list.innerHTML = '<li>Nenhuma notificação.</li>';
        return;
    }

    notificacoes.forEach(notif => {
        const li = document.createElement('li');
        if (!notif.lida) {
            li.classList.add('unread');
        }
        
        const time = new Date(notif.timestamp).toLocaleString('pt-BR');
        
        li.innerHTML = `
            <div>${notif.mensagem}</div>
            <div class="notification-time">${time}</div>
        `;
        
        li.addEventListener('click', () => {
            db.ref('pedidos').child(notif.pedidoId).once('value', (snapshot) => {
                const pedido = snapshot.val();
                if (pedido) {
                    openChat(notif.pedidoId, pedido.status);
                    db.ref(`notificacoes/${AppState.currentUser.data.uid}/${notif.id}`).update({ lida: true });
                    document.getElementById('notification-panel').style.display = 'none';
                } else {
                    showToast("O pedido desta notificação não foi encontrado ou foi excluído.", "error");
                    db.ref(`notificacoes/${AppState.currentUser.data.uid}/${notif.id}`).update({ lida: true });
                }
            });
        });

        list.appendChild(li);
    });
}

export function setupNotifications() {
    const bell = document.getElementById('notification-bell');
    const panel = document.getElementById('notification-panel');
    const countBadge = document.getElementById('notification-count');
    const btnClear = document.getElementById('btn-clear-notifications');

    if (!bell || !panel || !countBadge || !btnClear) return;

    if (!bell.hasAttribute('data-listener-attached')) {
        bell.addEventListener('click', (e) => {
            e.stopPropagation();
            panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
        });
        document.addEventListener('click', (e) => {
            if (panel.style.display === 'block' && !panel.contains(e.target) && !bell.contains(e.target)) {
                panel.style.display = 'none';
            }
        });
        bell.setAttribute('data-listener-attached', 'true');
    }

    if (!btnClear.hasAttribute('data-listener-attached')) {
        btnClear.addEventListener('click', (e) => {
            e.stopPropagation();
            
            // MUDANÇA: Substituído o confirm() pelo novo modal
            showConfirmModal('Tem certeza que deseja limpar todas as notificações?', () => {
                const userNotifRef = db.ref(`notificacoes/${AppState.currentUser.data.uid}`);
                userNotifRef.remove()
                    .then(() => {
                        showToast('Notificações limpas!', 'success');
                        panel.style.display = 'none';
                    })
                    .catch((error) => {
                        console.error('Erro ao limpar notificações:', error);
                        showToast('Não foi possível limpar as notificações.', 'error');
                    });
            });
        });
        btnClear.setAttribute('data-listener-attached', 'true');
    }

    const notifRef = db.ref(`notificacoes/${AppState.currentUser.data.uid}`);
    notifRef.orderByChild('timestamp').on('value', snapshot => {
        const notificacoes = [];
        let unreadCount = 0;
        snapshot.forEach(childSnapshot => {
            const notificacao = { id: childSnapshot.key, ...childSnapshot.val() };
            notificacoes.push(notificacao);
            if (!notificacao.lida) {
                unreadCount++;
            }
        });

        btnClear.style.display = notificacoes.length > 0 ? 'block' : 'none';

        if (unreadCount > 0) {
            countBadge.textContent = unreadCount;
            countBadge.style.display = 'flex';
        } else {
            countBadge.style.display = 'none';
        }

        renderNotifications(notificacoes.reverse());
    });
}