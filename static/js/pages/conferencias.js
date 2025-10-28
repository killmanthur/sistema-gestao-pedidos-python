// static/js/pages/conferencias.js
import { AppState } from '../state.js';
import { showToast } from '../toasts.js';
import { toggleButtonLoading, formatarData, showConfirmModal } from '../ui.js';

let state = {};
let intervalId = null;

function resetState() {
    state = {
        elementos: {},
        todasAtivas: [],
        listaEstoquistas: [],
    };
}

function criarCardElement(item) {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.id = item.id;
    const { role } = AppState.currentUser;
    let actions = '';
    let timeInfoHTML = '';

    // Define as permissões de forma clara
    let podeIniciar = ['Admin', 'Estoque', 'Recepção'].includes(role);
    let podeFinalizar = ['Admin', 'Estoque'].includes(role);
    let podeResolverFornecedor = (role === 'Admin' || role === 'Estoque');
    let podeResolverContabilidade = (role === 'Admin' || role === 'Contabilidade');

    switch (item.status) {
        case 'Aguardando Conferência':
            card.classList.add('card--status-awaiting');
            // --- INÍCIO DA CORREÇÃO DEFINITIVA ---
            // A lógica agora é: sempre crie o botão, mas adicione 'disabled' se não tiver permissão.
            actions = `<button class="btn btn--edit" data-action="iniciar" ${podeIniciar ? '' : 'disabled'}>Iniciar Conferência</button>`;
            break;
        // --- FIM DA CORREÇÃO DEFINITIVA ---

        case 'Em Conferência':
            card.classList.add('card--status-progress');
            timeInfoHTML = `<p><small><strong>Início:</strong> ${formatarData(item.data_inicio_conferencia)}</small></p>`;
            // Aplica a mesma lógica para outros botões, garantindo consistência
            actions = `<button class="btn btn--success" data-action="finalizar" ${podeFinalizar ? '' : 'disabled'}>Finalizar</button>`;
            break;

        case 'Pendente (Fornecedor)':
        case 'Pendente (Alteração)':
        case 'Pendente (Ambos)':
            card.classList.add('card--status-danger');
            timeInfoHTML = `<p><small><strong>Conferido em:</strong> ${formatarData(item.data_finalizacao)}</small></p>`;
            let podeResolverEsteItem = (!item.resolvido_gestor && podeResolverFornecedor) || (!item.resolvido_contabilidade && podeResolverContabilidade);
            actions = `<button class="btn btn--warning" data-action="resolver" ${podeResolverEsteItem ? '' : 'disabled'}>Acompanhar/Resolver</button>`;
            break;
    }

    let conferentesHTML = (item.conferentes && item.conferentes.length > 0)
        ? `<p><strong>Conferente(s):</strong> ${item.conferentes.join(', ')}</p>` : '';

    let observacoesHTML = '';
    if (item.observacoes && item.observacoes.length > 0) {
        const ultimasObs = [...item.observacoes].slice(-2).reverse();
        observacoesHTML = '<div class="obs-log-container mini-log">';
        ultimasObs.forEach(obs => {
            observacoesHTML += `<div class="obs-entry"><strong>${obs.autor}:</strong> ${obs.texto}<small>${formatarData(obs.timestamp)}</small></div>`;
        });
        observacoesHTML += '</div>';
    }

    card.innerHTML = `
        <div class="card__header"><h3>NF: ${item.numero_nota_fiscal}</h3></div>
        <div class="card__body">
            <p><strong>Fornecedor:</strong> ${item.nome_fornecedor}</p>
            ${conferentesHTML} ${timeInfoHTML} ${observacoesHTML}
        </div>
        <div class="card__footer"><div class="card__actions">${actions}</div></div>
    `;

    // Adiciona os event listeners apenas aos botões que NÃO estão desabilitados
    const actionButton = card.querySelector('[data-action]');
    if (actionButton && !actionButton.disabled) {
        const actionType = actionButton.dataset.action;
        if (actionType === 'iniciar') actionButton.addEventListener('click', () => openConferenteModal(item.id));
        if (actionType === 'finalizar') actionButton.addEventListener('click', () => openFinalizeModal(item.id));
        if (actionType === 'resolver') actionButton.addEventListener('click', () => openResolverModal(item));
    }

    return card;
}

// ... O restante do arquivo `conferencias.js` continua exatamente o mesmo que a versão anterior ...
function renderizarColunas() {
    const termo = state.elementos.filtroInput.value.toLowerCase().trim();
    const filterFn = item => item.numero_nota_fiscal.toLowerCase().includes(termo) || item.nome_fornecedor.toLowerCase().includes(termo);

    const render = (container, data) => {
        container.innerHTML = '';
        data.length > 0 ? data.forEach(item => container.appendChild(criarCardElement(item))) : container.innerHTML = `<p class="quadro-vazio-msg">Nenhum item aqui.</p>`;
    };

    const { quadroAguardando, quadroEmConferencia, quadroPendFornecedor, quadroPendContab } = state.elementos;
    render(quadroAguardando, state.todasAtivas.filter(c => c.status === 'Aguardando Conferência' && filterFn(c)));
    render(quadroEmConferencia, state.todasAtivas.filter(c => c.status === 'Em Conferência' && filterFn(c)));

    render(quadroPendFornecedor, state.todasAtivas.filter(c =>
        ['Pendente (Fornecedor)', 'Pendente (Ambos)'].includes(c.status) &&
        !c.resolvido_gestor &&
        filterFn(c)
    ));
    render(quadroPendContab, state.todasAtivas.filter(c =>
        ['Pendente (Alteração)', 'Pendente (Ambos)'].includes(c.status) &&
        !c.resolvido_contabilidade &&
        filterFn(c)
    ));
}

async function fetchData() {
    try {
        const response = await fetch('/api/conferencias/ativas');
        if (!response.ok) throw new Error('Falha ao buscar dados.');
        state.todasAtivas = await response.json();
        renderizarColunas();
    } catch (error) {
        showToast(error.message, "error");
        if (intervalId) clearInterval(intervalId);
    }
}

function openResolverModal(item) {
    const modal = state.elementos.resolverModal;
    modal.form.dataset.id = item.id;
    modal.form.reset();

    const histContainer = modal.form.querySelector('#historico-observacoes');
    histContainer.innerHTML = '<h4>Histórico de Ações:</h4>';
    if (item.observacoes && item.observacoes.length > 0) {
        [...item.observacoes].reverse().forEach(obs => {
            histContainer.innerHTML += `<div class="obs-entry"><strong>${obs.autor}:</strong> ${obs.texto}<small>${formatarData(obs.timestamp)}</small></div>`;
        });
    } else {
        histContainer.innerHTML += '<p>Nenhuma observação ainda.</p>';
    }

    const { role } = AppState.currentUser;
    let podeResolverFornecedor = (role === 'Admin' || role === 'Estoque') && !item.resolvido_gestor;
    let podeResolverContabilidade = (role === 'Admin' || role === 'Contabilidade') && !item.resolvido_contabilidade;
    modal.form.querySelector('button[type="submit"]').style.display = (podeResolverFornecedor || podeResolverContabilidade) ? 'inline-block' : 'none';

    modal.overlay.style.display = 'flex';
}

async function handleApiCall(form, url, method, body, successMessage, btnText) {
    const btn = form.querySelector('button[type="submit"]') || form.querySelector(`#${form.dataset.btnId}`);
    toggleButtonLoading(btn, true, 'Salvando...');
    try {
        const response = await fetch(url, {
            method: method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
        });
        if (!response.ok) throw new Error((await response.json()).error);
        showToast(successMessage, 'success');
        form.closest('.modal-overlay').style.display = 'none';
        await fetchData();
    } catch (error) {
        showToast(`Erro: ${error.message}`, 'error');
    } finally {
        toggleButtonLoading(btn, false, btnText);
    }
}

export function initConferenciasPage() {
    state = {
        elementos: {
            filtroInput: document.getElementById('filtro-conferencias'),
            quadroAguardando: document.getElementById('quadro-aguardando'),
            quadroEmConferencia: document.getElementById('quadro-em-conferencia'),
            quadroPendFornecedor: document.getElementById('quadro-pendencia-fornecedor'),
            quadroPendContab: document.getElementById('quadro-pendencia-contabilidade'),
            addConferenteModal: { overlay: document.getElementById('add-conferente-modal-overlay'), form: document.getElementById('form-add-conferente') },
            finalizeModal: { overlay: document.getElementById('finalize-modal-overlay'), form: document.getElementById('form-finalize-conferencia') },
            resolverModal: { overlay: document.getElementById('resolver-modal-overlay'), form: document.getElementById('form-resolver') }
        },
        todasAtivas: [], listaEstoquistas: [],
    };
    if (!state.elementos.quadroAguardando) return;

    state.elementos.filtroInput.addEventListener('input', renderizarColunas);

    state.elementos.addConferenteModal.form.addEventListener('submit', (e) => {
        e.preventDefault();
        const form = e.target, id = form.dataset.id;
        const conferentes = Array.from(form.querySelectorAll('input:checked')).map(cb => cb.value);
        if (conferentes.length === 0) return showToast('Selecione ao menos um conferente.', 'error');
        handleApiCall(form, `/api/conferencias/${id}/iniciar`, 'PUT', { conferentes, editor_nome: AppState.currentUser.nome }, 'Conferência iniciada!', 'Confirmar e Iniciar');
    });

    state.elementos.finalizeModal.form.addEventListener('submit', (e) => {
        e.preventDefault();
        const form = e.target, id = form.dataset.id;
        const body = {
            tem_pendencia_fornecedor: form.querySelector('#checkbox-pendencia-fornecedor').checked,
            solicita_alteracao: form.querySelector('#checkbox-solicitar-alteracao').checked,
            observacao: form.querySelector('#finalize-observacao').value, editor_nome: AppState.currentUser.nome
        };
        handleApiCall(form, `/api/conferencias/${id}/finalizar-conferencia`, 'PUT', body, 'Conferência finalizada!', 'Confirmar Finalização');
    });

    state.elementos.resolverModal.form.addEventListener('submit', (e) => {
        e.preventDefault();
        const form = e.target, id = form.dataset.id;
        const body = {
            observacao: form.querySelector('#resolver-observacao').value, editor_nome: AppState.currentUser.nome, user_role: AppState.currentUser.role
        };
        handleApiCall(form, `/api/conferencias/${id}/resolver-item`, 'PUT', body, 'Item resolvido!', 'Marcar como Resolvido');
    });

    state.elementos.resolverModal.form.querySelector('#btn-add-update').addEventListener('click', async (e) => {
        const btn = e.target;
        const form = btn.closest('form');
        const id = form.dataset.id;
        const texto = form.querySelector('#resolver-observacao').value;
        if (!texto.trim()) return showToast('A observação não pode estar vazia.', 'error');

        toggleButtonLoading(btn, true, 'Adicionando...');
        try {
            const response = await fetch(`/api/conferencias/${id}/observacao`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ texto, autor: AppState.currentUser.nome })
            });
            if (!response.ok) throw new Error((await response.json()).error);
            showToast('Atualização adicionada!', 'success');
            await fetchData();
            const itemAtualizado = state.todasAtivas.find(c => c.id == id);
            if (itemAtualizado) {
                openResolverModal(itemAtualizado);
            } else {
                form.closest('.modal-overlay').style.display = 'none';
            }
        } catch (error) {
            showToast(`Erro: ${error.message}`, 'error');
        } finally {
            toggleButtonLoading(btn, false, 'Adicionar Atualização');
        }
    });

    (async () => {
        try {
            const response = await fetch('/api/usuarios/estoquista-nomes');
            state.listaEstoquistas = await response.json();
        } catch (e) { showToast('Erro ao carregar lista de estoquistas.', 'error'); }
    })();

    fetchData();
    if (intervalId) clearInterval(intervalId);
    intervalId = setInterval(fetchData, 20000);
}

function openConferenteModal(id) {
    const modal = state.elementos.addConferenteModal;
    modal.form.dataset.id = id;
    const container = modal.form.querySelector('#conferentes-checkbox-container');
    container.innerHTML = state.listaEstoquistas.map(nome => `<label><input type="checkbox" name="conferente" value="${nome}"> ${nome}</label>`).join('');
    modal.overlay.style.display = 'flex';
}

function openFinalizeModal(id) {
    const modal = state.elementos.finalizeModal;
    modal.form.dataset.id = id;
    modal.form.reset();
    modal.overlay.style.display = 'flex';
}