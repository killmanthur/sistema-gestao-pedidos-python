import { AppState } from './state.js';
import { initializeAuthenticatedApp, initializePublicApp } from './main.js';
import { toggleButtonLoading, setupUI } from './ui.js';
import { showToast } from './toasts.js';

function handleLogin() {
    const formLogin = document.getElementById('form-login');
    if (!formLogin) return;
    setTimeout(() => document.getElementById('username')?.focus(), 100);

    formLogin.addEventListener('submit', async (e) => {
        e.preventDefault();

        const userInputElement = document.getElementById('username');
        const passwordElement = document.getElementById('password');
        const submitBtn = formLogin.querySelector('button[type="submit"]');
        const errorMsgElement = document.getElementById('login-error-message');

        const userInput = userInputElement.value.trim();
        const password = passwordElement.value;

        toggleButtonLoading(submitBtn, true, 'Entrando...');
        errorMsgElement.style.display = 'none';

        try {
            const response = await fetch('/api/usuarios/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: userInput, password: password })
            });

            const userData = await response.json();

            if (!response.ok) {
                throw new Error(userData.error || 'Erro desconhecido');
            }

            // Login bem-sucedido
            const currentUserData = {
                isLoggedIn: true,
                data: {
                    uid: userData.uid,
                    email: userData.email,
                    displayName: userData.nome
                },
                role: userData.role,
                nome: userData.nome,
                accessible_pages: userData.accessible_pages || [],
                permissions: userData.permissions || {}
            };

            AppState.currentUser = currentUserData;
            sessionStorage.setItem('currentUser', JSON.stringify(currentUserData));
            window.location.href = '/inicio';

        } catch (error) {
            errorMsgElement.textContent = error.message || 'Usuário ou senha incorretos.';
            errorMsgElement.style.display = 'block';
            toggleButtonLoading(submitBtn, false, 'Entrar');
        }
    });
}

export function handleLogout() {
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
        btnLogout.onclick = (e) => {
            e.preventDefault();
            sessionStorage.removeItem('currentUser');
            window.location.href = '/login';
        };
    }
}

export function setupAuthObserver() {
    const path = window.location.pathname;
    try {
        const storedUser = sessionStorage.getItem('currentUser');
        if (storedUser) {
            AppState.currentUser = JSON.parse(storedUser);
            if (path.includes('/login')) {
                window.location.href = '/inicio';
            } else {
                setupUI();
                initializeAuthenticatedApp();
            }
        } else {
            AppState.currentUser = { isLoggedIn: false };
            if (!path.includes('/login')) {
                window.location.href = '/login';
            } else {
                initializePublicApp();
            }
        }
    } catch (e) {
        sessionStorage.removeItem('currentUser');
        window.location.href = '/login';
    }
}

export function initLoginPage() {
    handleLogin();
}