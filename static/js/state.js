// static/js/state.js
export const AppState = {
    currentUser: {
        isLoggedIn: false,
        data: null, 
        role: null,
        nome: null,
        acessible_pages: [],
        compradorNomes: []
    },
    // MUDANÇA: Adicionado estado para a lista de compradores
    currentChatListener: null,
    isAppInitialized: false, // <-- ADICIONE ESTA LINHA
};