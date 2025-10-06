import { auth, db } from './firebase.js';
import { AppState } from './state.js';
import { initializeAuthenticatedApp, initializePublicApp } from './main.js';
import { toggleButtonLoading, setupUI } from './ui.js';
import { showToast } from './toasts.js';

function handleLogin() {
    const formLogin = document.getElementById('form-login');
    if (!formLogin) return;
    setTimeout(() => document.getElementById('username')?.focus(), 100);

    formLogin.addEventListener('submit', (e) => {
        e.preventDefault();

        const userInputElement = document.getElementById('username');
        const passwordElement = document.getElementById('password');
        const submitBtn = formLogin.querySelector('button[type="submit"]');

        const userInput = userInputElement.value.trim();
        const password = passwordElement.value;
        const domain = "@tratormax.net.br";
        let finalEmail = userInput.includes('@') ? userInput : `${userInput}${domain}`;

        toggleButtonLoading(submitBtn, true, 'Entrando...');

        auth.signInWithEmailAndPassword(finalEmail, password)
            .catch(error => {
                const errorMsgElement = document.getElementById('login-error-message');
                if (errorMsgElement) {
                    errorMsgElement.textContent = 'Usuário ou senha incorretos.';
                    errorMsgElement.style.display = 'block';
                }
                toggleButtonLoading(submitBtn, false, 'Entrar');
            });
    });
}

export function handleLogout() {
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
        btnLogout.onclick = (e) => {
            e.preventDefault();
            sessionStorage.removeItem('currentUser');
            auth.signOut();
        };
    }
}

export function setupAuthObserver() {
    try {
        const storedUser = sessionStorage.getItem('currentUser');
        if (storedUser) {
            AppState.currentUser = JSON.parse(storedUser);
            setupUI();
        }
    } catch (e) {
        sessionStorage.removeItem('currentUser');
    }

    auth.onAuthStateChanged(async (user) => {
        const path = window.location.pathname;

        if (user) {
            try {
                const userRef = db.ref(`usuarios/${user.uid}`);
                const snapshot = await userRef.once('value');
                const userData = snapshot.val();

                if (!userData) {
                    showToast("Dados do usuário não encontrados.", "error");
                    auth.signOut();
                    return;
                }

                // LÓGICA ALTERADA: Removemos a busca em 'permissoes_roles'
                // e pegamos as permissões diretamente do 'userData'.

                const currentUserData = {
                    isLoggedIn: true,
                    data: {
                        uid: user.uid,
                        email: user.email,
                        displayName: userData.nome
                    },
                    role: userData.role,
                    nome: userData.nome,
                    accessible_pages: userData.accessible_pages || [],
                    // Pega as permissões individuais do usuário
                    permissions: userData.permissions || {}
                };

                AppState.currentUser = currentUserData;
                sessionStorage.setItem('currentUser', JSON.stringify(currentUserData));

                setupUI();

                if (path.includes('/login')) {
                    window.location.href = '/inicio';
                } else {
                    initializeAuthenticatedApp();
                }

            } catch (error) {
                console.error("Erro CRÍTICO ao buscar dados do usuário após login. Deslogando.", error);
                auth.signOut();
            }
        } else {

            sessionStorage.removeItem('currentUser');
            AppState.currentUser = { isLoggedIn: false };

            if (!path.includes('/login')) {
                window.location.href = '/login';
            } else {
                initializePublicApp();
            }
        }
    });
}

export function initLoginPage() {
    handleLogin();
}