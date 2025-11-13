// static/js/pages/dashboard-logistica.js

import { showToast } from '../toasts.js';

let formFiltros, spinner, tabelaSeparadoresBody, tabelaConferentesBody;

function renderTable(tbodyElement, data, columns) {
    tbodyElement.innerHTML = '';
    if (!data || data.length === 0) {
        tbodyElement.innerHTML = `<tr><td colspan="${columns.length}">Nenhum dado encontrado para o período.</td></tr>`;
        return;
    }

    data.forEach(item => {
        const tr = document.createElement('tr');
        let rowHTML = '';
        columns.forEach(col => {
            rowHTML += `<td>${item[col] || 'N/A'}</td>`;
        });
        tr.innerHTML = rowHTML;
        tbodyElement.appendChild(tr);
    });
}

async function fetchAndRenderData() {
    spinner.style.display = 'block';
    tabelaSeparadoresBody.innerHTML = `<tr><td colspan="4">Carregando...</td></tr>`;
    tabelaConferentesBody.innerHTML = `<tr><td colspan="4">Carregando...</td></tr>`;

    const filtros = {
        dataInicio: document.getElementById('filtro-data-inicio').value,
        dataFim: document.getElementById('filtro-data-fim').value,
    };

    // --- INÍCIO DA ALTERAÇÃO ---
    // Adiciona uma verificação para não buscar se os filtros estiverem vazios
    if (!filtros.dataInicio && !filtros.dataFim) {
        showToast("Por favor, selecione um período para a consulta.", "info");
        spinner.style.display = 'none';
        tabelaSeparadoresBody.innerHTML = `<tr><td colspan="4">Aplique um filtro para visualizar os dados.</td></tr>`;
        tabelaConferentesBody.innerHTML = `<tr><td colspan="4">Aplique um filtro para visualizar os dados.</td></tr>`;
        return;
    }
    // --- FIM DA ALTERAÇÃO ---


    try {
        const response = await fetch('/api/separacoes/dashboard-data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(filtros),
        });

        if (!response.ok) {
            throw new Error('Falha ao buscar dados para o dashboard de logística.');
        }

        const data = await response.json();

        renderTable(tabelaSeparadoresBody, data.separadores, ['nome', 'count', 'total_pecas', 'avg_time_str']);
        renderTable(tabelaConferentesBody, data.conferentes, ['nome', 'count', 'total_pecas', 'avg_time_str']);

    } catch (error) {
        console.error(error);
        showToast(error.message, 'error');
        tabelaSeparadoresBody.innerHTML = `<tr><td colspan="4" style="color: var(--clr-danger);">Erro ao carregar.</td></tr>`;
        tabelaConferentesBody.innerHTML = `<tr><td colspan="4" style="color: var(--clr-danger);">Erro ao carregar.</td></tr>`;
    } finally {
        spinner.style.display = 'none';
    }
}

export function initDashboardLogisticaPage() {
    formFiltros = document.getElementById('form-filtros-logistica');
    spinner = document.getElementById('loading-spinner-dashboard');
    const btnLimpar = document.getElementById('btn-limpar-filtros');
    tabelaSeparadoresBody = document.querySelector('#tabela-separadores tbody');
    tabelaConferentesBody = document.querySelector('#tabela-conferentes tbody');

    if (!formFiltros) return;

    formFiltros.addEventListener('submit', (e) => {
        e.preventDefault();
        fetchAndRenderData();
    });

    btnLimpar.addEventListener('click', () => {
        formFiltros.reset();
        // --- ALTERAÇÃO AQUI ---
        // Limpa as tabelas ao limpar os filtros
        tabelaSeparadoresBody.innerHTML = `<tr><td colspan="4">Aplique um filtro para visualizar os dados.</td></tr>`;
        tabelaConferentesBody.innerHTML = `<tr><td colspan="4">Aplique um filtro para visualizar os dados.</td></tr>`;
    });

    // --- ALTERAÇÃO AQUI ---
    // A chamada inicial foi removida. O código abaixo define o estado inicial das tabelas.
    tabelaSeparadoresBody.innerHTML = `<tr><td colspan="4">Aplique um filtro para visualizar os dados.</td></tr>`;
    tabelaConferentesBody.innerHTML = `<tr><td colspan="4">Aplique um filtro para visualizar os dados.</td></tr>`;
}