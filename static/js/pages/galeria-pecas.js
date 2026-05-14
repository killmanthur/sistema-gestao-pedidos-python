// static/js/pages/galeria-pecas.js
import { AppState } from '../state.js';
import { showToast } from '../toasts.js';
import { formatarData, showConfirmModal } from '../ui.js';

const state = {
    filtro: 'pendentes',
    items: [],
};

function els() {
    return {
        tabs: document.getElementById('galeria-tabs'),
        grid: document.getElementById('galeria-grid'),
        lightbox: document.getElementById('foto-lightbox-galeria'),
        lightboxImg: document.getElementById('foto-lightbox-galeria-img'),
    };
}

function urlPorFiltro() {
    if (state.filtro === 'pendentes') return '/api/estoque/ajustes?com_foto=1&cadastrada_no_erp=0';
    if (state.filtro === 'cadastradas') return '/api/estoque/ajustes?com_foto=1&cadastrada_no_erp=1';
    return '/api/estoque/ajustes?com_foto=1';
}

async function carregar() {
    const e = els();
    e.grid.innerHTML = '<p class="empty-state">Carregando...</p>';
    try {
        const res = await fetch(urlPorFiltro());
        if (!res.ok) throw new Error('Falha ao carregar');
        state.items = await res.json();
        render();
    } catch (err) {
        e.grid.innerHTML = `<p class="empty-state">Erro: ${err.message}</p>`;
    }
}

function render() {
    const e = els();
    if (!state.items.length) {
        e.grid.innerHTML = '<p class="empty-state">Nenhuma foto neste filtro.</p>';
        return;
    }
    e.grid.innerHTML = state.items.map(a => {
        const acao = a.foto_cadastrada_no_erp
            ? `<button class="btn btn--secondary btn--sm btn-desmarcar">Desmarcar</button>`
            : `<button class="btn btn--primary btn--sm btn-marcar">Marcar cadastrada</button>`;
        return `
            <div class="galeria-card" data-id="${a.id}">
                <img src="${a.foto_url}" class="galeria-card__img" data-foto="${a.foto_url}" alt="Peça ${a.codigo}">
                <div class="galeria-card__body">
                    <div class="galeria-card__codigo">${a.codigo}</div>
                    <div class="galeria-card__marca">${a.marca}</div>
                    <div class="galeria-card__meta">${formatarData(a.data_criacao)}</div>
                    <div class="galeria-card__meta">por ${a.criado_por}</div>
                    ${a.foto_cadastrada_no_erp ? `<div class="galeria-card__cadastrada">✓ cadastrada por ${a.foto_cadastrada_por || '—'}</div>` : ''}
                    <div class="galeria-card__actions">${acao}</div>
                </div>
            </div>
        `;
    }).join('');

    e.grid.querySelectorAll('.galeria-card').forEach(card => {
        const id = parseInt(card.dataset.id);
        const item = state.items.find(i => i.id === id);
        card.querySelector('.galeria-card__img').addEventListener('click', (ev) => {
            abrirLightbox(ev.currentTarget.dataset.foto);
        });
        card.querySelector('.btn-marcar')?.addEventListener('click', () => marcar(item));
        card.querySelector('.btn-desmarcar')?.addEventListener('click', () => desmarcar(item));
    });
}

function abrirLightbox(url) {
    const e = els();
    e.lightboxImg.src = url;
    e.lightbox.style.display = 'flex';
}

async function marcar(item) {
    try {
        const res = await fetch(`/api/estoque/ajustes/${item.id}/foto-cadastrada`, { method: 'POST' });
        if (!res.ok) throw new Error('Erro ao marcar');
        showToast('Marcada como cadastrada no ERP.', 'success');
        carregar();
    } catch (e) {
        showToast(e.message, 'error');
    }
}

async function desmarcar(item) {
    showConfirmModal('Desmarcar esta foto como cadastrada?', async () => {
        try {
            const res = await fetch(`/api/estoque/ajustes/${item.id}/foto-cadastrada`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Erro ao desmarcar');
            showToast('Desmarcada.', 'success');
            carregar();
        } catch (e) {
            showToast(e.message, 'error');
        }
    });
}

export function initGaleriaPecasPage() {
    const e = els();
    if (!e.tabs) return;

    e.tabs.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            e.tabs.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.filtro = btn.dataset.filtro;
            carregar();
        });
    });

    e.lightbox.addEventListener('click', () => {
        e.lightbox.style.display = 'none';
        e.lightboxImg.src = '';
    });

    if (AppState.socket) {
        AppState.socket.off('ajuste_estoque_atualizado');
        AppState.socket.on('ajuste_estoque_atualizado', () => carregar());
    }

    carregar();
}
