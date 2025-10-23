// static/js/chat.js
// Responsabilidade: Toda a lógica relacionada ao modal de chat em tempo real.


import { AppState } from './state.js';
import { toggleButtonLoading } from './ui.js';
import { showToast } from './toasts.js';

export function openChat(pedidoId, pedidoStatus) {
    const modalOverlay = document.getElementById('chat-modal-overlay');
    const messagesContainer = document.getElementById('chat-messages');
    const chatForm = document.getElementById('form-chat');

    if (!modalOverlay || !messagesContainer) return;

    messagesContainer.innerHTML = '<p>Carregando mensagens...</p>';
    modalOverlay.style.display = 'flex';
    modalOverlay.dataset.pedidoId = pedidoId;

    if (pedidoStatus === 'OK') {
        chatForm.style.display = 'none';
    } else {
        chatForm.style.display = 'flex';
        setTimeout(() => document.getElementById('chat-input')?.focus(), 100);
    }

    if (AppState.currentChatListener) {
        AppState.currentChatListener.off();
    }

    const chatRef = db.ref(`chats/${pedidoId}`);
    AppState.currentChatListener = chatRef.orderByChild('timestamp');

    AppState.currentChatListener.on('value', snapshot => {
        messagesContainer.innerHTML = '';
        if (!snapshot.exists()) {
            messagesContainer.innerHTML = '<p>Nenhuma mensagem ainda. Seja o primeiro a enviar!</p>';
            return;
        }

        snapshot.forEach(childSnapshot => {
            const message = childSnapshot.val();
            const messageElement = document.createElement('div');
            messageElement.classList.add('chat-message');

            const messageType = message.remetente === AppState.currentUser.nome ? 'sent' : 'received';
            messageElement.classList.add(messageType);

            messageElement.innerHTML = `
                <div class="message-sender">${message.remetente}</div>
                <div class="message-bubble">${message.texto}</div>
            `;
            messagesContainer.appendChild(messageElement);
        });

        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    });
}

export function setupChatModal() {
    const modalOverlay = document.getElementById('chat-modal-overlay');
    const chatForm = document.getElementById('form-chat');
    const chatInput = document.getElementById('chat-input');
    const sendBtn = chatForm?.querySelector('button');

    if (!modalOverlay || !chatForm) return;

    // CORREÇÃO: Toda a lógica de fechar o modal (variável btnClose, função closeModal,
    // e os listeners de clique) foi removida daqui, pois agora é gerenciada
    // globalmente pela função setupAllModalCloseHandlers em ui.js.

    chatForm.onsubmit = async (e) => {
        e.preventDefault();
        const pedidoId = modalOverlay.dataset.pedidoId;
        const texto = chatInput.value.trim();

        if (!pedidoId || !texto) return;

        toggleButtonLoading(sendBtn, true, 'Enviar');

        const dadosMensagem = {
            remetente_uid: AppState.currentUser.data.uid,
            remetente_nome: AppState.currentUser.nome,
            texto: texto
        };

        try {
            const response = await fetch(`/api/chats/${pedidoId}/message`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dadosMensagem)
            });
            if (response.ok) {
                chatInput.value = '';
            } else {
                const errorData = await response.json();
                showToast(`Não foi possível enviar a mensagem: ${errorData.error}`, 'error');
            }
        } catch (error) {
            console.error("Erro ao enviar mensagem:", error);
            showToast("Erro de conexão ao enviar mensagem.", 'error');
        } finally {
            toggleButtonLoading(sendBtn, false, 'Enviar');
            chatInput.focus();
        }
    };
}