// static/js/pages/separacoes.js
import { AppState } from '../state.js';
import { showToast } from '../toasts.js';
import { toggleButtonLoading, formatarData, showConfirmModal, openLogModal } from '../ui.js';

let state = {};
let debounceTimer;
let autoRefreshInterval = null;

function resetState() {
    state = {
        elementos: {},
        listasUsuarios: { expedicao: [], vendedores: [], separadores: [] },
        todasAsSeparacoesAtivas: [],
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
    const conferenteSelect = modal.conferenteSelect;
    populateSelect(conferenteSelect, state.listasUsuarios.expedicao, separacao.conferente_nome);
    conferenteSelect.insertAdjacentHTML('afterbegin', '<option value="">-- Remover Conferente --</option>');
    if (!separacao.conferente_nome) {
        conferenteSelect.value = "";
    }
    modal.overlay.style.display = 'flex';
};

async function fetchAndRenderFila() {
    const listaFila = document.getElementById('fila-separadores-lista');
    const separadorSelect = document.getElementById('separador-nome');
    if (!listaFila || !separadorSelect) return;

    try {
        const response = await fetch('/api/separacoes/fila-separadores');
        if (!response.ok) throw new Error('Falha ao buscar fila.');
        const filaVisivel = await response.json(); // A API já retorna a fila filtrada e ordenada

        // Renderiza a fila de prioridade na tela
        listaFila.innerHTML = '';
        if (filaVisivel.length > 0) {
            filaVisivel.forEach((nome, index) => {
                const li = document.createElement('li');
                li.textContent = nome;
                if (index === 0) {
                    li.classList.add('proximo-separador');
                }
                listaFila.appendChild(li);
            });
        } else {
            listaFila.innerHTML = '<li>Nenhum separador ativo na fila.</li>';
        }

        // Popula o dropdown do formulário
        if (filaVisivel.length > 0) {
            populateSelect(separadorSelect, filaVisivel, filaVisivel[0]);
        } else {
            separadorSelect.innerHTML = '<option value="" disabled selected>Sem separadores ativos...</option>';
        }

    } catch (error) {
        listaFila.innerHTML = '<li>Erro ao carregar a fila.</li>';
        separadorSelect.innerHTML = '<option value="" disabled selected>Erro...</option>';
        console.error(error);
    }
}

async function openFilaModal() {
    const modal = state.elementos.gerenciarFilaModal;
    const container = modal.checkboxContainer;

    modal.overlay.style.display = 'flex';
    container.innerHTML = '<div class="spinner" style="margin: 1rem auto;"></div>';

    try {
        const response = await fetch('/api/separacoes/status-todos-separadores');
        if (!response.ok) throw new Error('Falha ao buscar a lista de separadores.');

        const separadores = await response.json();
        container.innerHTML = '';

        if (separadores.length === 0) {
            container.innerHTML = '<p>Nenhum usuário com a função "Separador" encontrado.</p>';
            return;
        }

        separadores.forEach(sep => {
            const label = document.createElement('label');
            label.innerHTML = `
                <input type="checkbox" value="${sep.nome}" ${sep.ativo ? 'checked' : ''}>
                ${sep.nome}
            `;
            container.appendChild(label);
        });

    } catch (error) {
        showToast(error.message, 'error');
        container.innerHTML = `<p style="color: var(--clr-danger);">${error.message}</p>`;
    }
}

async function handleSaveFila(event) {
    event.preventDefault();
    const modal = state.elementos.gerenciarFilaModal;
    const saveBtn = modal.saveButton;
    toggleButtonLoading(saveBtn, true, 'Salvando...');

    // A lógica simplificada apenas pega os nomes dos checkboxes marcados
    const checkboxes = modal.checkboxContainer.querySelectorAll('input[type="checkbox"]:checked');
    const nomesAtivos = Array.from(checkboxes).map(cb => cb.value);

    try {
        const response = await fetch('/api/separacoes/fila-separadores', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(nomesAtivos), // Envia apenas a lista de nomes ativos
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Falha ao salvar a fila.');
        }

        showToast('Fila de separação atualizada com sucesso!', 'success');
        modal.overlay.style.display = 'none';
        await fetchAndRenderFila();

    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        toggleButtonLoading(saveBtn, false, 'Salvar Alterações');
    }
}

function criarCardElement(separacao) {
    const card = document.createElement('div');
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
            if (obs.role === 'Expedição') obsStyle = 'color: var(--clr-warning);';
            else if (obs.role === 'Vendedor') obsStyle = 'color: var(--clr-primary);';
            const obsTimestamp = formatarData(obs.timestamp);
            observacoesHTML += `<div class="obs-entry"><span style="${obsStyle}"><strong>${obs.autor}:</strong> ${obs.texto}</span><small>${obsTimestamp}</small></div>`;
        });
        observacoesHTML += '</div>';
    }

    card.innerHTML = `<div class="card__header"><h3>Mov. ${separacao.numero_movimentacao}</h3><div class="card__header-actions">${logBtn}${deleteBtn}</div></div><div class="card__body"><div class="card-info-grid"><p><strong>Cliente:</strong> ${separacao.nome_cliente}</p><p><strong>Vendedor:</strong> ${separacao.vendedor_nome}</p><p><strong>Separador:</strong> ${separacao.separador_nome || 'N/A'}</p><p><strong>Conferente:</strong> ${separacao.conferente_nome || 'N/A'}</p><p><strong>Criação:</strong> ${formatarData(separacao.data_criacao)}</p>${separacao.data_finalizacao ? `<p><strong>Finalização:</strong> ${formatarData(separacao.data_finalizacao)}</p>` : ''}</div>${observacoesHTML}</div>${footerHTML}`;

    card.querySelector('[data-action="show-log"]')?.addEventListener('click', () => openLogModal(separacao.id, 'separacoes'));
    card.querySelector('[data-action="delete"]')?.addEventListener('click', () => handleDelete(separacao.id));
    card.querySelector('[data-action="edit"]')?.addEventListener('click', () => openEditModal(separacao));
    card.querySelector('[data-action="observation"]')?.addEventListener('click', () => openObservacaoModal(separacao));
    card.querySelector('[data-action="finalize"]')?.addEventListener('click', () => handleFinalize(separacao.id));
    card.querySelector('[data-action="assign-conferente"]')?.addEventListener('change', (e) => handleAssignConferente(e, separacao.id));

    return card;
}
function filtrarErenderizarColunasAtivas() {
    let separacoesAtivasFiltradas = state.todasAsSeparacoesAtivas;
    const termoBusca = state.elementos.filtroInput.value.toLowerCase().trim();
    if (termoBusca) {
        separacoesAtivasFiltradas = state.todasAsSeparacoesAtivas.filter(s =>
            Object.values(s).some(val => String(val).toLowerCase().includes(termoBusca)) ||
            String(s.conferente_nome).toLowerCase().includes(termoBusca)
        );
    }
    state.dadosAtivos.andamento = separacoesAtivasFiltradas.filter(s => s.status === 'Em Separação').sort((a, b) => parseInt(b.numero_movimentacao, 10) - parseInt(a.numero_movimentacao, 10));
    state.dadosAtivos.conferencia = separacoesAtivasFiltradas.filter(s => s.status === 'Em Conferência').sort((a, b) => parseInt(b.numero_movimentacao, 10) - parseInt(a.numero_movimentacao, 10));
    renderizarColunasAtivas();
}
function renderizarColunasAtivas() {
    const { andamento, conferencia } = state.dadosAtivos;
    state.elementos.quadroAndamento.innerHTML = '';
    state.elementos.quadroConferencia.innerHTML = '';
    if (andamento.length === 0) state.elementos.quadroAndamento.innerHTML = `<p class="quadro-vazio-msg">Nenhuma separação nesta etapa.</p>`;
    else andamento.forEach(item => state.elementos.quadroAndamento.appendChild(criarCardElement(item)));
    if (conferencia.length === 0) state.elementos.quadroConferencia.innerHTML = `<p class="quadro-vazio-msg">Nenhuma separação nesta etapa.</p>`;
    else conferencia.forEach(item => state.elementos.quadroConferencia.appendChild(criarCardElement(item)));
}
function renderizarColunaFinalizados(novosItens, limpar = false) {
    if (limpar) state.elementos.quadroFinalizadas.innerHTML = '';
    if (novosItens.length > 0) novosItens.forEach(item => state.elementos.quadroFinalizadas.appendChild(criarCardElement(item)));
    else if (limpar) state.elementos.quadroFinalizadas.innerHTML = `<p class="quadro-vazio-msg">Nenhuma separação finalizada.</p>`;
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
    } catch (error) {
        showToast("Não foi possível carregar as listas de usuários.", "error");
    }
}
function populateSelect(selectElement, dataList, selectedValue) {
    if (!selectElement) return;
    const placeholder = selectElement.dataset.placeholder || "Selecione";
    selectElement.innerHTML = `<option value="" disabled>${placeholder}</option>`;
    dataList.forEach(nome => {
        const option = document.createElement('option');
        option.value = nome;
        option.textContent = nome;
        selectElement.appendChild(option);
    });
    if (selectedValue) {
        selectElement.value = selectedValue;
    } else if (dataList.length === 0) {
        selectElement.innerHTML = `<option value="" disabled selected>Nenhum disponível</option>`;
    } else {
        selectElement.selectedIndex = 0;
    }
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
        if (window.location.pathname.includes('/gerenciar-separacoes')) window.location.reload();
        else await fetchAndRenderFila();
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

function startAutoRefresh() {
    if (autoRefreshInterval) clearInterval(autoRefreshInterval);
    autoRefreshInterval = setInterval(async () => {
        // ATUALIZA APENAS OS QUADROS ATIVOS
        await fetchActiveSeparacoes();
    }, 15000);
}

async function fetchActiveSeparacoes() {
    try {
        const { role, nome } = AppState.currentUser;
        const response = await fetch(`/api/separacoes/ativas?user_role=${role}&user_name=${nome}`);
        if (!response.ok) throw new Error('Falha ao buscar separações ativas.');

        state.todasAsSeparacoesAtivas = await response.json();
        filtrarErenderizarColunasAtivas(); // Reutiliza a função de filtragem e renderização que já existe

    } catch (error) {
        console.error("Erro ao buscar separações ativas:", error);
        showToast(error.message, 'error');
    }
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
        gerenciarFilaModal: {
            overlay: document.getElementById('gerenciar-fila-modal-overlay'),
            form: document.getElementById('form-gerenciar-fila'),
            checkboxContainer: document.getElementById('fila-checkbox-container'),
            saveButton: document.getElementById('btn-save-fila'),
            cancelButton: document.getElementById('btn-cancel-fila'),
            btnGerenciar: document.getElementById('btn-gerenciar-fila'),
        },
        editModal: {
            overlay: document.getElementById('edit-separacao-modal-overlay'),
            form: document.getElementById('form-edit-separacao'),
            movimentacaoInput: document.getElementById('edit-numero-movimentacao'),
            clienteInput: document.getElementById('edit-nome-cliente'),
            vendedorSelect: document.getElementById('edit-vendedor-nome'),
            separadorSelect: document.getElementById('edit-separador-nome'),
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
    if (AppState.currentUser.permissions?.pode_criar_separacao) document.getElementById('form-container-separacao').style.display = 'block';
    const filaContainer = document.getElementById('container-fila-separadores');
    if (filaContainer) {
        const userRole = AppState.currentUser.role;
        if (userRole === 'Admin' || userRole === 'Separador') filaContainer.style.display = 'block';
        else filaContainer.style.display = 'none';
    }
    const userRole = AppState.currentUser.role;
    if (userRole === 'Admin' || userRole === 'Separador') state.elementos.gerenciarFilaModal.btnGerenciar.style.display = 'block';
    else state.elementos.gerenciarFilaModal.btnGerenciar.style.display = 'none';
    if (AppState.currentUser.permissions?.pode_criar_separacao) document.getElementById('form-container-separacao').style.display = 'block';
    const filaModal = state.elementos.gerenciarFilaModal;
    if (filaModal.btnGerenciar) filaModal.btnGerenciar.addEventListener('click', openFilaModal);
    if (filaModal.form) filaModal.form.addEventListener('submit', handleSaveFila);
    if (filaModal.cancelButton) filaModal.cancelButton.addEventListener('click', () => { filaModal.overlay.style.display = 'none'; });
    state.elementos.filtroInput.addEventListener('input', e => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            state.termoBusca = e.target.value;
            filtrarErenderizarColunasAtivas();
            carregarFinalizados(true);
        }, 500);
    });
    state.elementos.btnCarregarMais.addEventListener('click', () => carregarFinalizados(false));
    state.elementos.btnReload.addEventListener('click', () => {
        state.elementos.filtroInput.value = '';
        state.termoBusca = '';
        carregarFinalizados(true);
        
    });
    if (state.elementos.formSeparacao) state.elementos.formSeparacao.addEventListener('submit', handleFormSubmit);
    if (state.elementos.editModal.form) {
        state.elementos.editModal.form.addEventListener('submit', handleEditFormSubmit);
        state.elementos.editModal.cancelButton.addEventListener('click', () => { state.elementos.editModal.overlay.style.display = 'none'; });
    }
    if (state.elementos.obsModal.form) {
        state.elementos.obsModal.form.addEventListener('submit', handleObsFormSubmit);
        state.elementos.obsModal.cancelButton.addEventListener('click', () => { state.elementos.obsModal.overlay.style.display = 'none'; });
    }
    await fetchInitialData();
    await fetchActiveSeparacoes();
    await fetchAndRenderFila();
    await carregarFinalizados(true);
    startAutoRefresh();
}