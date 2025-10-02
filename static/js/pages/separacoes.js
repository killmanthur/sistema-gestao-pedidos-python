// static/js/pages/separacoes.js
import { AppState } from '../state.js';
import { db } from '../firebase.js';
import { showToast } from '../toasts.js';
import { toggleButtonLoading, formatarData, showConfirmModal, openLogModal } from '../ui.js';
import { clearNotificationsBackend } from '../notifications-separacao.js';

let state = {};
let debounceTimer;
// NOVO: Variável para o timer de atualização automática
let autoRefreshInterval = null;

function resetState() {
    state = {
        elementos: {},
        listasUsuarios: { expedicao: [], vendedores: [], separadores: [] },
        dadosAtivos: { andamento: [], conferencia: [] },
        dadosFinalizados: [],
        paginaAtual: 0,
        carregando: false,
        temMais: true,
        termoBusca: ''
    };
}

export function openEditModal(separacao) {
    const modal = state.elementos.editModal;
    modal.form.dataset.id = separacao.id;
    modal.movimentacaoInput.value = separacao.numero_movimentacao;
    modal.clienteInput.value = separacao.nome_cliente;
    populateSelect(modal.vendedorSelect, state.listasUsuarios.vendedores, separacao.vendedor_nome);
    populateSelect(modal.separadorSelect, state.listasUsuarios.separadores, separacao.separador_nome);
    // MUDANÇA: Popula o novo select de conferente
    const conferenteSelect = modal.conferenteSelect;
    populateSelect(conferenteSelect, state.listasUsuarios.expedicao, separacao.conferente_nome);
    // Adiciona a opção de remover/limpar o conferente
    conferenteSelect.insertAdjacentHTML('afterbegin', '<option value="">-- Remover Conferente --</option>');
    if (!separacao.conferente_nome) {
        conferenteSelect.value = "";
    }


    modal.overlay.style.display = 'flex';
};

async function fetchAndRenderFila() {
    const filaContainer = document.getElementById('container-fila-separadores');
    // MUDANÇA: Adiciona uma verificação para ver se o container da fila está visível
    if (!filaContainer || filaContainer.style.display === 'none') {
        return; // Não faz nada se a fila não for visível para o usuário
    }
    const listaFila = document.getElementById('fila-separadores-lista');
    if (!listaFila) return;
    try {
        const response = await fetch('/api/separacoes/fila-separadores');
        const fila = await response.json();
        if (!response.ok) throw new Error('Falha ao buscar fila.');

        listaFila.innerHTML = '';
        const filaVisivel = fila.filter(nome => nome.toLowerCase() !== 'separacao');

        filaVisivel.forEach((nome, index) => {
            const li = document.createElement('li');
            li.textContent = nome;
            if (index === 0) {
                li.classList.add('proximo-separador');
            }
            listaFila.appendChild(li);
        });

        const separadorSelect = document.getElementById('separador-nome');
        if (separadorSelect && fila.length > 0) {
            separadorSelect.value = fila[0];
        }

    } catch (error) {
        listaFila.innerHTML = '<li>Erro ao carregar a fila.</li>';
        console.error(error);
    }
}


function criarCardElement(separacao) {
    const card = document.createElement('div');
    // CORREÇÃO: Readicionando a classe 'separacao-card' para aplicar os estilos compactos
    card.className = 'card separacao-card';
    card.dataset.id = separacao.id;

    if (separacao.status === 'Finalizado') card.classList.add('card--status-done');
    else if (separacao.status === 'Em Conferência') card.classList.add('card--status-progress');
    else card.classList.add('card--status-awaiting');

    const perms = AppState.currentUser.permissions || {};
    const logBtn = `<button class="btn-icon" data-action="show-log" title="Ver Histórico"><img src="/static/history.svg" alt="Histórico"></button>`;
    const deleteBtn = perms.pode_deletar_separacao ? `<button class="btn btn--danger" data-action="delete" title="Excluir">Excluir</button>` : '';

    const hasObs = separacao.observacoes && Object.keys(separacao.observacoes).length > 0;
    const obsBtnClass = hasObs ? 'btn--info' : 'btn--secondary';
    const obsBtn = perms.pode_gerenciar_observacao_separacao && separacao.status !== 'Finalizado'
        ? `<button class="btn ${obsBtnClass}" data-action="observation">Observação</button>`
        : '';

    const podeEditarFinalizada = perms.pode_editar_separacao_finalizada;

    let footerActions = [];
    if (separacao.status === 'Em Separação' && perms.pode_editar_separacao) {
        footerActions.push(`<button class="btn btn--edit" data-action="edit">Editar</button>`);
    } else if (separacao.status === 'Em Conferência') {
        if (perms.pode_editar_separacao) footerActions.push(`<button class="btn btn--edit" data-action="edit">Editar</button>`);
        if (perms.pode_finalizar_separacao) footerActions.push(`<button class="btn btn--success" data-action="finalize">Finalizar</button>`);
    } else if (separacao.status === 'Finalizado' && podeEditarFinalizada) {
        footerActions.push(`<button class="btn btn--edit" data-action="edit">Editar</button>`);
    }
    if (obsBtn) footerActions.push(obsBtn);

    let footerHTML = '';
    if (separacao.status === 'Em Separação' && perms.pode_enviar_para_conferencia) {
        let options = '<option value="" disabled selected>-- Enviar para Conferente --</option>';
        state.listasUsuarios.expedicao.forEach(nome => options += `<option value="${nome}">${nome}</option>`);
        const conferenteSelect = `<div class="comprador-select-wrapper"><select data-action="assign-conferente">${options}</select></div>`;
        footerHTML = `<div class="card__footer">
                        <div class="card__actions">${footerActions.join('')}</div>
                        ${conferenteSelect}
                      </div>`;
    } else {
        const statusBadge = separacao.status === 'Finalizado' ? `<div class="finalizado-badge">Finalizado</div>` : '';
        footerHTML = `<div class="card__footer">
                        ${statusBadge}
                        <div class="card__actions" ${statusBadge ? 'style="margin-top: 0.5rem;"' : ''}>${footerActions.join('')}</div>
                      </div>`;
    }

    let observacoesHTML = '';
    if (hasObs) {
        const obsArray = Object.values(separacao.observacoes).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        observacoesHTML = '<div class="obs-log-container">';
        obsArray.forEach(obs => {
            let obsStyle = '';
            if (obs.role === 'Expedição') {
                obsStyle = 'color: var(--clr-warning);';
            } else if (obs.role === 'Vendedor') {
                obsStyle = 'color: var(--clr-primary);';
            }
            const obsTimestamp = formatarData(obs.timestamp);
            observacoesHTML += `
                <div class="obs-entry">
                    <span style="${obsStyle}"><strong>${obs.autor}:</strong> ${obs.texto}</span>
                    <small>${obsTimestamp}</small>
                </div>
            `;
        });
        observacoesHTML += '</div>';
    }


    // CORREÇÃO: Restaurando a estrutura compacta com 'card-info-grid'
    card.innerHTML = `
        <div class="card__header">
            <h3>Mov. ${separacao.numero_movimentacao}</h3>
            <div class="card__header-actions">${logBtn}${deleteBtn}</div>
        </div>
        <div class="card__body">
            <div class="card-info-grid">
                <p><strong>Cliente:</strong> ${separacao.nome_cliente}</p>
                <p><strong>Vendedor:</strong> ${separacao.vendedor_nome}</p>
                <p><strong>Separador:</strong> ${separacao.separador_nome || 'N/A'}</p>
                <p><strong>Conferente:</strong> ${separacao.conferente_nome || 'N/A'}</p>
                <p><strong>Criação:</strong> ${formatarData(separacao.data_criacao)}</p>
                ${separacao.data_finalizacao ? `<p><strong>Finalização:</strong> ${formatarData(separacao.data_finalizacao)}</p>` : ''}
            </div>
            ${observacoesHTML}
        </div>
        ${footerHTML}`;

    card.querySelector('[data-action="show-log"]')?.addEventListener('click', () => openLogModal(separacao.id, 'separacoes'));
    card.querySelector('[data-action="delete"]')?.addEventListener('click', () => handleDelete(separacao.id));
    card.querySelector('[data-action="edit"]')?.addEventListener('click', () => openEditModal(separacao));
    card.querySelector('[data-action="observation"]')?.addEventListener('click', () => openObservacaoModal(separacao));
    card.querySelector('[data-action="finalize"]')?.addEventListener('click', () => handleFinalize(separacao.id));
    card.querySelector('[data-action="assign-conferente"]')?.addEventListener('change', (e) => handleAssignConferente(e, separacao.id));

    return card;
}

function renderizarColunasAtivas() {
    const { andamento, conferencia } = state.dadosAtivos;
    state.elementos.quadroAndamento.innerHTML = '';
    state.elementos.quadroConferencia.innerHTML = '';

    if (andamento.length === 0) {
        state.elementos.quadroAndamento.innerHTML = `<p class="quadro-vazio-msg">Nenhuma separação nesta etapa.</p>`;
    } else {
        andamento.forEach(item => state.elementos.quadroAndamento.appendChild(criarCardElement(item)));
    }

    if (conferencia.length === 0) {
        state.elementos.quadroConferencia.innerHTML = `<p class="quadro-vazio-msg">Nenhuma separação nesta etapa.</p>`;
    } else {
        conferencia.forEach(item => state.elementos.quadroConferencia.appendChild(criarCardElement(item)));
    }
}

function renderizarColunaFinalizados(novosItens, limpar = false) {
    if (limpar) {
        state.elementos.quadroFinalizadas.innerHTML = '';
    }
    if (novosItens.length > 0) {
        novosItens.forEach(item => state.elementos.quadroFinalizadas.appendChild(criarCardElement(item)));
    } else if (limpar) {
        state.elementos.quadroFinalizadas.innerHTML = `<p class="quadro-vazio-msg">Nenhuma separação finalizada.</p>`;
    }
}

function setupRealtimeListener() {
    const separacoesRef = db.ref('separacoes');
    separacoesRef.on('value', (snapshot) => {
        const todasSeparacoes = snapshot.val() || {};
        const listaCompleta = Object.entries(todasSeparacoes).map(([id, data]) => ({ id, ...data }));

        let separacoesAtivas = listaCompleta.filter(s => s.status !== 'Finalizado');

        if (AppState.currentUser.role === 'Vendedor') {
            separacoesAtivas = separacoesAtivas.filter(s => s.vendedor_nome === AppState.currentUser.nome);
        }

        const termoBusca = state.elementos.filtroInput.value.toLowerCase().trim();
        if (termoBusca) {
            separacoesAtivas = separacoesAtivas.filter(s =>
                Object.values(s).some(val => String(val).toLowerCase().includes(termoBusca))
            );
        }

        state.dadosAtivos.andamento = separacoesAtivas.filter(s => s.status === 'Em Separação').sort((a, b) => new Date(b.data_criacao) - new Date(a.data_criacao));
        state.dadosAtivos.conferencia = separacoesAtivas.filter(s => s.status === 'Em Conferência').sort((a, b) => new Date(b.data_criacao) - new Date(a.data_criacao));

        renderizarColunasAtivas();
    });
}


async function carregarFinalizados(recarregar = false) {
    if (state.carregando || (!state.temMais && !recarregar)) return;

    state.carregando = true;
    if (recarregar) {
        state.paginaAtual = 0;
        state.temMais = true;
        state.dadosFinalizados = [];
    }

    state.elementos.spinner.style.display = 'block';
    state.elementos.btnCarregarMais.style.display = 'none';

    try {
        const response = await fetch('/api/separacoes/paginadas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                page: state.paginaAtual,
                search: state.termoBusca,
                user_role: AppState.currentUser.role,
                user_name: AppState.currentUser.nome
            })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);

        renderizarColunaFinalizados(data.finalizadas, recarregar);
        state.dadosFinalizados.push(...data.finalizadas);

        state.temMais = data.temMais;
        state.paginaAtual++;

    } catch (error) {
        showToast(`Erro ao carregar separações: ${error.message}`, 'error');
    } finally {
        state.carregando = false;
        state.elementos.spinner.style.display = 'none';
        state.elementos.btnCarregarMais.style.display = state.temMais ? 'block' : 'none';
    }
}

async function fetchInitialData() {
    try {
        const [exp, vend, sep] = await Promise.all([
            fetch('/api/usuarios/expedicao-nomes').then(res => res.json()),
            fetch('/api/usuarios/vendedor-nomes').then(res => res.json()),
            fetch('/api/usuarios/separador-nomes').then(res => res.json())
        ]);
        const separadoresVisiveis = sep.filter(nome => nome.toLowerCase() !== 'separacao');
        state.listasUsuarios = { expedicao: exp, vendedores: vend, separadores: separadoresVisiveis };
        populateSelect(state.elementos.editModal.vendedorSelect, vend);
        populateSelect(state.elementos.editModal.separadorSelect, separadoresVisiveis);
        populateSelect(document.getElementById('vendedor-nome'), vend);
        populateSelect(document.getElementById('separador-nome'), separadoresVisiveis);
    } catch (error) {
        showToast("Não foi possível carregar as listas de usuários.", "error");
    }
}

function populateSelect(selectElement, dataList, selectedValue) {
    if (!selectElement) return;
    const placeholder = selectElement.dataset.placeholder || "Selecione";
    selectElement.innerHTML = `<option value="" disabled selected>${placeholder}</option>`;
    dataList.forEach(nome => {
        const option = document.createElement('option');
        option.value = nome;
        option.textContent = nome;
        if (nome === selectedValue) {
            option.selected = true;
        }
        selectElement.appendChild(option);
    });
}

const handleDelete = (separacaoId) => {
    showConfirmModal('EXCLUIR esta separação?', async () => {
        try {
            const response = await fetch(`/api/separacoes/${separacaoId}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ editor_nome: AppState.currentUser.nome })
            });
            if (!response.ok) throw new Error((await response.json()).error);
            showToast('Separação excluída!', 'success');
            await fetchAndRenderFila();
        } catch (error) { showToast(`Erro: ${error.message}`, 'error'); }
    });
};

const handleFinalize = (separacaoId) => {
    showConfirmModal('Finalizar esta separação?', async () => {
        try {
            const response = await fetch(`/api/separacoes/${separacaoId}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'Finalizado', editor_nome: AppState.currentUser.nome })
            });
            if (!response.ok) throw new Error((await response.json()).error);
            showToast('Separação finalizada!', 'success');
            await carregarFinalizados(true);
            await fetchAndRenderFila();
        } catch (error) { showToast(`Erro: ${error.message}`, 'error'); }
    });
};

const handleAssignConferente = (e, separacaoId) => {
    const conferenteNome = e.target.value;
    if (!conferenteNome) return;
    showConfirmModal(`Atribuir ao conferente "${conferenteNome}"?`, async () => {
        try {
            const response = await fetch(`/api/separacoes/${separacaoId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ conferente_nome: conferenteNome, editor_nome: AppState.currentUser.nome })
            });
            if (!response.ok) throw new Error((await response.json()).error);
            showToast('Enviado para conferência!', 'success');
            await fetchAndRenderFila();
        } catch (error) {
            showToast(`Erro: ${error.message}`, 'error');
            e.target.value = '';
        }
    });
};

function openObservacaoModal(separacao) {
    const modal = state.elementos.obsModal;
    modal.form.dataset.id = separacao.id;
    modal.textoInput.value = '';
    modal.overlay.style.display = 'flex';
}

async function handleFormSubmit(event) {
    event.preventDefault();
    const submitBtn = state.elementos.formSeparacao.querySelector('button[type="submit"]');
    const movInput = document.getElementById('numero-movimentacao');
    if (movInput.value.length !== 6) {
        showToast('O Nº de Movimentação deve ter exatamente 6 dígitos.', 'error');
        movInput.focus();
        return;
    }

    toggleButtonLoading(submitBtn, true, 'Criando...');
    const dados = {
        numero_movimentacao: movInput.value,
        nome_cliente: document.getElementById('nome-cliente').value,
        vendedor_nome: document.getElementById('vendedor-nome').value,
        separador_nome: document.getElementById('separador-nome').value,
        editor_nome: AppState.currentUser.nome
    };
    try {
        const response = await fetch('/api/separacoes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados)
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Falha ao criar.');

        showToast('Separação criada com sucesso!', 'success');
        state.elementos.formSeparacao.reset();
        await fetchAndRenderFila();
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        toggleButtonLoading(submitBtn, false, 'Criar');
    }
}

async function handleEditFormSubmit(event) {
    event.preventDefault();
    const modal = state.elementos.editModal;
    const movInput = document.getElementById('edit-numero-movimentacao');
    if (movInput.value.length !== 6) {
        showToast('O Nº de Movimentação deve ter exatamente 6 dígitos.', 'error');
        movInput.focus();
        return;
    }

    toggleButtonLoading(modal.saveButton, true, 'Salvando...');
    const separacaoId = modal.form.dataset.id;
    const dados = {
        numero_movimentacao: movInput.value,
        nome_cliente: document.getElementById('edit-nome-cliente').value,
        vendedor_nome: modal.vendedorSelect.value,
        separador_nome: modal.separadorSelect.value,
        // MUDANÇA: Envia o valor do novo campo
        conferente_nome: modal.conferenteSelect.value,
        editor_nome: AppState.currentUser.nome
    };

    try {
        const response = await fetch(`/api/separacoes/${separacaoId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados)
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Falha ao salvar.');

        showToast('Separação salva com sucesso!', 'success');
        modal.overlay.style.display = 'none';

        if (window.location.pathname.includes('/gerenciar-separacoes')) {
            window.location.reload();
        } else {
            await fetchAndRenderFila();
        }

    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        toggleButtonLoading(modal.saveButton, false, 'Salvar Alterações');
    }
}

async function handleObsFormSubmit(event) {
    event.preventDefault();
    const modal = state.elementos.obsModal;
    toggleButtonLoading(modal.saveButton, true, 'Salvando...');
    const separacaoId = modal.form.dataset.id;

    const dados = {
        texto: modal.textoInput.value,
        autor: AppState.currentUser.nome,
        role: AppState.currentUser.role
    };

    try {
        const response = await fetch(`/api/separacoes/${separacaoId}/observacao`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados)
        });
        if (!response.ok) throw new Error((await response.json()).error || 'Falha ao salvar.');
        showToast('Observação adicionada com sucesso!', 'success');
        modal.overlay.style.display = 'none';
        await fetchAndRenderFila();
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        toggleButtonLoading(modal.saveButton, false, 'Salvar Observação');
    }
}

// NOVO: Função para iniciar o timer de atualização automática
function startAutoRefresh() {
    // Limpa qualquer timer anterior para evitar múltiplos timers rodando
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
    }

    // Configura um novo timer para recarregar os dados a cada 15 segundos
    autoRefreshInterval = setInterval(async () => {
        console.log("Atualizando dados da página de separações automaticamente...");
        // Recarrega apenas a lista de finalizados, pois as outras são em tempo real
        // mas sem limpar a tela para uma experiência mais fluida.
        // Para uma recarga completa, seria carregarFinalizados(true).
        await carregarFinalizados(true);
        await fetchAndRenderFila();
    }, 15000); // 15000 milissegundos = 15 segundos
}

export async function initSeparacoesPage() {
    resetState();

    state.elementos = {
        formSeparacao: document.getElementById('form-separacao'),
        quadroAndamento: document.getElementById('quadro-separacoes-andamento'),
        quadroConferencia: document.getElementById('quadro-separacoes-conferencia'),
        quadroFinalizadas: document.getElementById('quadro-separacoes-finalizadas'),
        filtroInput: document.getElementById('filtro-separacoes'),
        spinner: document.getElementById('loading-spinner'),
        btnCarregarMais: document.getElementById('btn-carregar-mais'),
        btnReload: document.getElementById('btn-reload-separacoes'),
        editModal: {
            overlay: document.getElementById('edit-separacao-modal-overlay'),
            form: document.getElementById('form-edit-separacao'),
            movimentacaoInput: document.getElementById('edit-numero-movimentacao'),
            clienteInput: document.getElementById('edit-nome-cliente'),
            vendedorSelect: document.getElementById('edit-vendedor-nome'),
            separadorSelect: document.getElementById('edit-separador-nome'),
            // MUDANÇA: Adiciona referência ao novo select
            conferenteSelect: document.getElementById('edit-conferente-nome'),
            saveButton: document.getElementById('btn-save-edit-separacao'),
            cancelButton: document.getElementById('btn-cancel-edit-separacao')
        },
        obsModal: {
            overlay: document.getElementById('obs-separacao-modal-overlay'),
            form: document.getElementById('form-obs-separacao'),
            textoInput: document.getElementById('obs-texto'),
            saveButton: document.getElementById('btn-save-obs-separacao'),
            cancelButton: document.getElementById('btn-cancel-obs-separacao')
        }
    };

    if (AppState.currentUser.permissions?.pode_criar_separacao) {
        document.getElementById('form-container-separacao').style.display = 'block';
    }

    // NOVO: Controla a visibilidade da fila de separadores
    const filaContainer = document.getElementById('container-fila-separadores');
    if (filaContainer) {
        const userRole = AppState.currentUser.role;
        // A fila só é visível para Admin e Separador
        if (userRole === 'Admin' || userRole === 'Separador') {
            filaContainer.style.display = 'block';
        } else {
            filaContainer.style.display = 'none';
        }
    }

    state.elementos.filtroInput.addEventListener('input', e => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            state.termoBusca = e.target.value;
            // O filtro agora é tratado pelo listener de tempo real e pela recarga dos finalizados
            carregarFinalizados(true);
        }, 500);
    });

    state.elementos.btnCarregarMais.addEventListener('click', () => carregarFinalizados(false));

    state.elementos.btnReload.addEventListener('click', () => {
        clearNotificationsBackend();
        carregarFinalizados(true);
        fetchAndRenderFila();
    });

    if (state.elementos.formSeparacao) {
        state.elementos.formSeparacao.addEventListener('submit', handleFormSubmit);
    }
    if (state.elementos.editModal.form) {
        state.elementos.editModal.form.addEventListener('submit', handleEditFormSubmit);
        state.elementos.editModal.cancelButton.addEventListener('click', () => {
            state.elementos.editModal.overlay.style.display = 'none';
        });
    }
    if (state.elementos.obsModal.form) {
        state.elementos.obsModal.form.addEventListener('submit', handleObsFormSubmit);
        state.elementos.obsModal.cancelButton.addEventListener('click', () => {
            state.elementos.obsModal.overlay.style.display = 'none';
        });
    }

    await fetchInitialData();
    setupRealtimeListener();
    await carregarFinalizados(true);
    await fetchAndRenderFila();

    // NOVO: Inicia o timer de atualização automática
    startAutoRefresh();
}