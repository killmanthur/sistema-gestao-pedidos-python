// static/js/toasts.js
// Responsabilidade: Centralizar a exibição de notificações "toast"
// para feedback ao usuário.

/**
 * Mostra uma notificação toast.
 * @param {string} text - A mensagem a ser exibida.
 * @param {'success' | 'error' | 'info'} type - O tipo de notificação.
 */
export function showToast(text, type = 'info') {
    let backgroundColor;

    switch (type) {
        case 'success':
            backgroundColor = "linear-gradient(to right, #00b09b, #96c93d)";
            break;
        case 'error':
            backgroundColor = "linear-gradient(to right, #ff5f6d, #ffc371)";
            break;
        default:
            backgroundColor = "linear-gradient(to right, #6a11cb, #2575fc)";
            break;
    }

    Toastify({
        text: text,
        duration: 3000,
        close: true,
        gravity: "top", // `top` or `bottom`
        position: "right", // `left`, `center` or `right`
        stopOnFocus: true, // Prevents dismissing of toast on hover
        style: {
            background: backgroundColor,
        },
    }).showToast();
}