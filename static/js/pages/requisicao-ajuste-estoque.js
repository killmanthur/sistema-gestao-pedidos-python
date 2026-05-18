// static/js/pages/requisicao-ajuste-estoque.js
import { AppState } from '../state.js';
import { showToast } from '../toasts.js';
import { formatarData } from '../ui.js';

const state = {
    fotoBlob: null,
    scannerInstance: null,
    lastRead: null,
    lastReadCount: 0,
    lastReadAt: 0,
    campanhas: [],
    campanhaAtivaId: null,
    torchOn: false,
};

const SCAN_CONFIRMATIONS = 3;
const LS_CAMPANHA_KEY = 'ajuste:campanha-ativa';

function cacheEls() {
    return {
        banner: document.getElementById('campanha-banner'),
        semCampanha: document.getElementById('sem-campanha'),
        blocoForm: document.getElementById('bloco-form'),
        form: document.getElementById('form-ajuste'),
        codigo: document.getElementById('ajuste-codigo'),
        marca: document.getElementById('ajuste-marca'),
        descricao: document.getElementById('ajuste-descricao'),
        qtdSistema: document.getElementById('ajuste-qtd-sistema'),
        qtdReal: document.getElementById('ajuste-qtd-real'),
        foto: document.getElementById('ajuste-foto'),
        fotoPreview: document.getElementById('foto-preview'),
        btnEnviar: document.getElementById('btn-enviar-ajuste'),
        btnScan: document.getElementById('btn-scan'),
        btnScanCancel: document.getElementById('btn-scan-cancel'),
        btnScanClose: document.getElementById('btn-scan-close'),
        btnScanTorch: document.getElementById('btn-scan-torch'),
        scannerArea: document.getElementById('scanner-area'),
        listaRecentes: document.getElementById('lista-recentes'),
    };
}

let scannerEscHandler = null;
let scannerPopstateHandler = null;

// --- Compressão client-side ---
async function comprimirImagem(file, maxSize = 1280, quality = 0.85) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                let { width, height } = img;
                if (width > maxSize || height > maxSize) {
                    if (width > height) {
                        height = Math.round((height * maxSize) / width);
                        width = maxSize;
                    } else {
                        width = Math.round((width * maxSize) / height);
                        height = maxSize;
                    }
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob(
                    (blob) => (blob ? resolve(blob) : reject(new Error('Falha ao comprimir'))),
                    'image/jpeg',
                    quality
                );
            };
            img.onerror = () => reject(new Error('Falha ao carregar imagem'));
            img.src = e.target.result;
        };
        reader.onerror = () => reject(new Error('Falha ao ler arquivo'));
        reader.readAsDataURL(file);
    });
}

// --- Scanner via câmera (html5-qrcode lazy load) ---
function carregarHtml5Qrcode() {
    return new Promise((resolve, reject) => {
        if (window.Html5Qrcode) return resolve(window.Html5Qrcode);
        const urls = [
            'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js',
            'https://unpkg.com/html5-qrcode@2.3.8/minified/html5-qrcode.min.js',
        ];
        let idx = 0;
        const tryNext = () => {
            if (idx >= urls.length) return reject(new Error('Falha ao carregar biblioteca de scanner (CDN)'));
            const script = document.createElement('script');
            script.src = urls[idx++];
            script.onload = () => {
                if (window.Html5Qrcode) resolve(window.Html5Qrcode);
                else tryNext();
            };
            script.onerror = () => tryNext();
            document.head.appendChild(script);
        };
        tryNext();
    });
}

function formatScannerError(err) {
    if (!err) return 'Erro desconhecido';
    if (typeof err === 'string') return err;
    if (err.message) return err.message;
    if (err.name) return err.name;
    try { return JSON.stringify(err); } catch (e) { return String(err); }
}

function atualizarStatusScan(count) {
    const statusEl = document.getElementById('scan-status');
    if (!statusEl) return;
    if (count === 0) {
        statusEl.textContent = 'Aproxime o código de barras da câmera...';
        statusEl.className = 'scan-status';
        return;
    }
    statusEl.textContent = `Confirmando leitura (${count}/${SCAN_CONFIRMATIONS})...`;
    statusEl.className = 'scan-status scan-status--reading';
}

function getActiveVideoTrack() {
    const video = document.querySelector('#qr-reader video');
    if (!video || !video.srcObject) return null;
    const tracks = video.srcObject.getVideoTracks ? video.srcObject.getVideoTracks() : [];
    return tracks[0] || null;
}

function atualizarBotaoTorch(els) {
    if (!els.btnScanTorch) return;
    const track = getActiveVideoTrack();
    const caps = track && track.getCapabilities ? track.getCapabilities() : {};
    if (!track || !caps.torch) {
        els.btnScanTorch.style.display = 'none';
        return;
    }
    els.btnScanTorch.style.display = '';
    els.btnScanTorch.textContent = state.torchOn ? '🔦 Desligar flash' : '🔦 Ligar flash';
}

async function alternarTorch(els) {
    const track = getActiveVideoTrack();
    if (!track) {
        showToast('Câmera não está ativa.', 'error');
        return;
    }
    const caps = track.getCapabilities ? track.getCapabilities() : {};
    if (!caps.torch) {
        showToast('Este dispositivo não suporta flash.', 'error');
        return;
    }
    const desejado = !state.torchOn;
    try {
        await track.applyConstraints({ advanced: [{ torch: desejado }] });
        state.torchOn = desejado;
        atualizarBotaoTorch(els);
    } catch (e) {
        showToast('Falha ao alternar flash: ' + formatScannerError(e), 'error');
    }
}

async function iniciarScanner(els) {
    if (!window.isSecureContext) {
        showToast('A câmera só funciona em HTTPS. Acesse pelo domínio seguro.', 'error');
        return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showToast('Este navegador não suporta acesso à câmera.', 'error');
        return;
    }
    try {
        await carregarHtml5Qrcode();
        els.scannerArea.style.display = 'flex';
        document.body.classList.add('scanner-open');

        scannerEscHandler = (e) => {
            if (e.key === 'Escape') pararScanner(els);
        };
        document.addEventListener('keydown', scannerEscHandler);

        // Botão "Voltar" do celular fecha o scanner em vez de sair da página
        try {
            history.pushState({ scannerOpen: true }, '');
            scannerPopstateHandler = () => pararScanner(els);
            window.addEventListener('popstate', scannerPopstateHandler);
        } catch (_) { /* history pode falhar em alguns contextos */ }

        const Html5Qrcode = window.Html5Qrcode;
        if (state.scannerInstance) {
            try { await state.scannerInstance.stop(); } catch (e) {}
            try { state.scannerInstance.clear(); } catch (e) {}
            state.scannerInstance = null;
        }
        state.lastRead = null;
        state.lastReadCount = 0;
        state.lastReadAt = 0;
        state.torchOn = false;
        atualizarStatusScan(0);
        if (els.btnScanTorch) els.btnScanTorch.style.display = 'none';

        state.scannerInstance = new Html5Qrcode('qr-reader');
        await state.scannerInstance.start(
            { facingMode: 'environment' },
            {
                fps: 15,
                qrbox: { width: 280, height: 180 },
                aspectRatio: 1.777,
                disableFlip: false,
            },
            (decodedText) => {
                const code = (decodedText || '').trim();
                if (!code) return;

                const agora = Date.now();
                if (agora - state.lastReadAt > 1500) {
                    state.lastRead = null;
                    state.lastReadCount = 0;
                }
                state.lastReadAt = agora;

                if (code === state.lastRead) {
                    state.lastReadCount += 1;
                } else {
                    state.lastRead = code;
                    state.lastReadCount = 1;
                }

                atualizarStatusScan(state.lastReadCount);

                if (state.lastReadCount >= SCAN_CONFIRMATIONS) {
                    els.codigo.value = code;
                    if (navigator.vibrate) navigator.vibrate(80);
                    pararScanner(els);
                    els.marca.focus();
                }
            },
            () => {}
        );
        setTimeout(() => atualizarBotaoTorch(els), 300);
    } catch (err) {
        console.error('Scanner error:', err);
        showToast('Não foi possível iniciar a câmera: ' + formatScannerError(err), 'error');
        await pararScanner(els);
    }
}

async function pararScanner(els) {
    els.scannerArea.style.display = 'none';
    document.body.classList.remove('scanner-open');

    if (scannerEscHandler) {
        document.removeEventListener('keydown', scannerEscHandler);
        scannerEscHandler = null;
    }
    if (scannerPopstateHandler) {
        window.removeEventListener('popstate', scannerPopstateHandler);
        scannerPopstateHandler = null;
        // Se o overlay estava no topo do history (pushState próprio), recua.
        if (history.state && history.state.scannerOpen) {
            try { history.back(); } catch (_) {}
        }
    }

    if (state.scannerInstance) {
        try { await state.scannerInstance.stop(); } catch (e) {}
        try { state.scannerInstance.clear(); } catch (e) {}
        state.scannerInstance = null;
    }
    state.torchOn = false;
    if (els.btnScanTorch) {
        els.btnScanTorch.style.display = 'none';
        els.btnScanTorch.textContent = '🔦 Ligar flash';
    }
}

// --- Campanhas ---
async function carregarCampanhas(els) {
    try {
        const res = await fetch('/api/estoque/campanhas/minhas-ativas');
        if (!res.ok) throw new Error('Falha ao carregar campanhas');
        state.campanhas = await res.json();
    } catch (e) {
        els.banner.className = 'campanha-banner campanha-banner--erro';
        els.banner.textContent = 'Erro ao carregar campanhas: ' + e.message;
        return;
    }

    if (!state.campanhas.length) {
        els.banner.style.display = 'none';
        els.semCampanha.style.display = 'block';
        els.blocoForm.style.display = 'none';
        return;
    }

    const salva = parseInt(localStorage.getItem(LS_CAMPANHA_KEY));
    const preferida = state.campanhas.find(c => c.id === salva);
    state.campanhaAtivaId = preferida ? preferida.id : state.campanhas[0].id;

    els.semCampanha.style.display = 'none';
    els.blocoForm.style.display = 'block';
    renderBanner(els);
    carregarRecentes(els);
}

function renderBanner(els) {
    const ativa = state.campanhas.find(c => c.id === state.campanhaAtivaId);
    if (!ativa) return;
    const multi = state.campanhas.length > 1;
    els.banner.className = 'campanha-banner';
    els.banner.innerHTML = `
        <div class="campanha-banner__row">
            <span class="campanha-banner__label">Campanha</span>
            ${multi
                ? `<select id="campanha-select" class="campanha-banner__select">
                    ${state.campanhas.map(c => `
                        <option value="${c.id}" ${c.id === state.campanhaAtivaId ? 'selected' : ''}>${c.nome}</option>
                    `).join('')}
                   </select>`
                : `<span class="campanha-banner__nome">${ativa.nome}</span>`
            }
        </div>
        <div class="campanha-banner__meta">
            ${ativa.ajustadores.length} ajustador${ativa.ajustadores.length === 1 ? '' : 'es'}
            · iniciada ${formatarData(ativa.data_inicio)}
        </div>
    `;
    const select = els.banner.querySelector('#campanha-select');
    if (select) {
        select.addEventListener('change', (e) => {
            state.campanhaAtivaId = parseInt(e.target.value);
            localStorage.setItem(LS_CAMPANHA_KEY, String(state.campanhaAtivaId));
            renderBanner(els);
            carregarRecentes(els);
        });
    }
}

// --- Lista de requisições recentes ---
async function carregarRecentes(els) {
    if (!state.campanhaAtivaId) return;
    try {
        const res = await fetch(`/api/estoque/ajustes?somente_minhas=1&limit=20&campanha_id=${state.campanhaAtivaId}`);
        if (!res.ok) throw new Error('Falha ao carregar');
        const ajustes = await res.json();
        renderRecentes(els, ajustes);
    } catch (e) {
        els.listaRecentes.innerHTML = '<p class="empty-state">Erro ao carregar requisições.</p>';
    }
}

function renderRecentes(els, ajustes) {
    if (!ajustes.length) {
        els.listaRecentes.innerHTML = '<p class="empty-state">Nenhuma requisição sua nesta campanha ainda.</p>';
        return;
    }
    els.listaRecentes.innerHTML = ajustes.map(a => {
        const statusClass = a.status === 'Pendente' ? 'status-pendente'
            : a.status === 'Ajustado' ? 'status-ajustado'
            : 'status-cancelado';
        const fotoHtml = a.foto_url
            ? `<img src="${a.foto_url}" class="ajuste-thumb" alt="Foto">`
            : '';
        return `
            <div class="ajuste-mini-card">
                ${fotoHtml}
                <div class="ajuste-mini-card__body">
                    <div class="ajuste-mini-card__head">
                        <strong>${a.codigo}</strong>
                        <span class="badge ${statusClass}">${a.status}</span>
                    </div>
                    <div>${a.marca}</div>
                    <div class="ajuste-mini-card__meta">
                        Qtd real: <strong>${a.quantidade_real}</strong>
                        ${a.quantidade_sistema != null ? ` · Sistema: ${a.quantidade_sistema}` : ''}
                    </div>
                    <div class="ajuste-mini-card__meta">${formatarData(a.data_criacao)}</div>
                </div>
            </div>
        `;
    }).join('');
}

// --- Submit ---
async function enviarRequisicao(els) {
    if (!state.campanhaAtivaId) {
        showToast('Selecione uma campanha ativa.', 'error');
        return;
    }
    const codigo = els.codigo.value.trim();
    const marca = els.marca.value.trim();
    const qtdReal = els.qtdReal.value;
    if (!codigo) {
        showToast('Informe o código.', 'error');
        els.codigo.focus();
        return;
    }
    if (!marca) {
        showToast('Informe a marca.', 'error');
        els.marca.focus();
        return;
    }
    if (qtdReal === '' || isNaN(parseInt(qtdReal))) {
        showToast('Informe a quantidade real.', 'error');
        els.qtdReal.focus();
        return;
    }

    const fd = new FormData();
    fd.append('campanha_id', state.campanhaAtivaId);
    fd.append('codigo', codigo);
    fd.append('marca', marca);
    fd.append('descricao', els.descricao.value.trim());
    if (els.qtdSistema.value !== '') fd.append('quantidade_sistema', els.qtdSistema.value);
    fd.append('quantidade_real', qtdReal);
    if (state.fotoBlob) {
        fd.append('foto', state.fotoBlob, 'peca.jpg');
    }

    els.btnEnviar.disabled = true;
    els.btnEnviar.textContent = 'Enviando...';
    try {
        const res = await fetch('/api/estoque/ajustes', { method: 'POST', body: fd });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Erro ao enviar');
        }
        showToast('Requisição enviada!', 'success');
        els.form.reset();
        state.fotoBlob = null;
        els.fotoPreview.innerHTML = '';
        els.codigo.focus();
        carregarRecentes(els);
    } catch (e) {
        showToast(e.message, 'error');
    } finally {
        els.btnEnviar.disabled = false;
        els.btnEnviar.textContent = 'Enviar Requisição';
    }
}

export function initRequisicaoAjusteEstoquePage() {
    const els = cacheEls();
    if (!els.form) return;

    setTimeout(() => els.codigo.focus(), 100);

    els.codigo.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (els.codigo.value.trim()) {
                els.marca.focus();
            }
        }
    });

    els.btnScan.addEventListener('click', () => iniciarScanner(els));
    els.btnScanCancel.addEventListener('click', () => pararScanner(els));
    if (els.btnScanClose) {
        els.btnScanClose.addEventListener('click', () => pararScanner(els));
    }
    if (els.btnScanTorch) {
        els.btnScanTorch.addEventListener('click', () => alternarTorch(els));
    }

    els.foto.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) {
            state.fotoBlob = null;
            els.fotoPreview.innerHTML = '';
            return;
        }
        try {
            state.fotoBlob = await comprimirImagem(file);
            const url = URL.createObjectURL(state.fotoBlob);
            els.fotoPreview.innerHTML = `<img src="${url}" alt="preview">`;
        } catch (err) {
            showToast('Erro ao processar foto: ' + err.message, 'error');
            state.fotoBlob = null;
            els.fotoPreview.innerHTML = '';
        }
    });

    els.form.addEventListener('submit', (e) => {
        e.preventDefault();
        enviarRequisicao(els);
    });

    if (AppState.socket) {
        AppState.socket.off('ajuste_estoque_atualizado');
        AppState.socket.off('campanha_ajuste_criada');
        AppState.socket.off('campanha_ajuste_atualizada');
        AppState.socket.on('ajuste_estoque_atualizado', () => carregarRecentes(els));
        AppState.socket.on('campanha_ajuste_criada', () => carregarCampanhas(els));
        AppState.socket.on('campanha_ajuste_atualizada', () => carregarCampanhas(els));
    }

    carregarCampanhas(els);
}
