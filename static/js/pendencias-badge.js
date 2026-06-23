// static/js/pendencias-badge.js
// Badge de "Pendências e Alterações" no menu (gatilho Logística + linha da página).
// A badge conta apenas as pendências que ESTE usuário ainda não visualizou.
// Ao abrir a página de pendências, tudo é marcado como visto e a badge some.
import { AppState } from './state.js';

const BADGE_IDS = ['pendencias-dropdown-badge', 'pendencias-nav-badge'];

function uid() {
    return AppState.currentUser?.data?.uid || 'anon';
}

function temAcesso() {
    const user = AppState.currentUser;
    if (!user || !user.isLoggedIn) return false;
    return user.role === 'Admin'
        || (Array.isArray(user.accessible_pages)
            && user.accessible_pages.includes('pendencias_e_alteracoes'));
}

function naPaginaPendencias() {
    return window.location.pathname.includes('/pendencias-e-alteracoes');
}

// --- "Visto" persistido por usuário (localStorage) ---
// Mapa { [id]: assinatura } do que o usuário já visualizou. A assinatura muda
// quando há atualização de status/observação, fazendo a badge reacender.
function chaveVistos() {
    return `pendencias_vistas_${uid()}`;
}
function getVistos() {
    try {
        const v = JSON.parse(localStorage.getItem(chaveVistos()));
        return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
    } catch (e) {
        return {};
    }
}
function setVistos(mapa) {
    try {
        localStorage.setItem(chaveVistos(), JSON.stringify(mapa));
    } catch (e) { /* storage cheio/indisponível: ignora */ }
}

function pintarBadges(quantidade) {
    BADGE_IDS.forEach(id => {
        const badge = document.getElementById(id);
        if (!badge) return;
        if (quantidade > 0) {
            const texto = quantidade > 99 ? '99+' : String(quantidade);
            const mudou = badge.textContent !== texto;
            badge.textContent = texto;
            badge.style.display = 'inline-flex';
            if (mudou) {
                badge.classList.remove('notification-badge--pulse');
                void badge.offsetWidth;          // reinicia a animação
                badge.classList.add('notification-badge--pulse');
            }
        } else {
            badge.style.display = 'none';
            badge.textContent = '';
        }
    });
}

// Aplica a contagem de não vistos a partir dos itens [{id, v}] pendentes.
function aplicar(items) {
    items = Array.isArray(items) ? items : [];

    // Estando na página de pendências, considera tudo como visto.
    if (naPaginaPendencias()) {
        const mapa = {};
        items.forEach(it => { mapa[it.id] = it.v; });
        setVistos(mapa);
        pintarBadges(0);
        return;
    }

    const vistos = getVistos();
    // Novo = pendência ainda não vista OU com atividade (assinatura) diferente.
    const naoVistos = items.filter(it => vistos[it.id] !== it.v);
    // Mantém em "vistos" só o que ainda está pendente (evita crescer indefinidamente).
    const mantido = {};
    items.forEach(it => {
        if (vistos[it.id] !== undefined) mantido[it.id] = vistos[it.id];
    });
    setVistos(mantido);
    pintarBadges(naoVistos.length);
}

async function atualizar() {
    if (!temAcesso()) return;
    try {
        const res = await fetch('/api/conferencias/pendencias-count');
        if (!res.ok) return;
        const data = await res.json();
        aplicar(data.items || []);
    } catch (e) {
        // silencioso: a badge é informativa
    }
}

function onPendenciasAtualizado(data) {
    if (data && Array.isArray(data.items)) {
        aplicar(data.items);
    } else {
        atualizar();
    }
}

export function setupPendenciasBadge() {
    if (!temAcesso()) return;

    if (AppState.socket) {
        // Remove só o nosso handler (não afeta listeners de outras telas).
        AppState.socket.off('pendencias_atualizado', onPendenciasAtualizado);
        AppState.socket.on('pendencias_atualizado', onPendenciasAtualizado);
    }

    atualizar();
}
