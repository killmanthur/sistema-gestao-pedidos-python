// static/js/firebase.js
// Responsabilidade: Inicializar o Firebase e exportar as instâncias
// para que outros módulos possam usá-las.

const firebaseConfig = {
    apiKey: "AIzaSyDkr2ahx6VoDyWv0L9jsceRWjjtBMLQ7js",
    authDomain: "quadro-de-servicos-berti.firebaseapp.com",
    databaseURL: "https://quadro-de-servicos-berti-default-rtdb.firebaseio.com",
    projectId: "quadro-de-servicos-berti",
    storageBucket: "quadro-de-servicos-berti.appspot.com",
    messagingSenderId: "61554293964",
    appId: "1:61554293964:web:aa720a49cfa46c45401669"
};

try {
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
} catch (e) {
    console.error("Erro CRÍTICO ao inicializar o Firebase: ", e);
    alert("Falha grave na configuração do Firebase. A aplicação não pode continuar.");
}

// Exporta as instâncias principais do Firebase
export const auth = firebase.auth();
export const db = firebase.database();