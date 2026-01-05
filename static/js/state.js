// static/js/state.js
export const AppState = {
    currentUser: {
        isLoggedIn: false,
        data: null,
        role: null,
        nome: null,
        acessible_pages: [],
    },
    compradorNomes: [], // Mantido para compatibilidade
    currentChatListener: null,
    isAppInitialized: false,
    socket: null, // <-- ADICIONADO
};