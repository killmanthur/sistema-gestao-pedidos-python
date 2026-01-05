// static/js/pages/dashboard-conferencias.js

import { showToast } from '../toasts.js';

let formFiltros, spinner, tabelaConferentesBody, tabelaFornecedoresBody;

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
            rowHTML += `<td>${item[col] !== undefined ? item[col] : 'N/A'}</td>`;
        });
        tr.innerHTML = rowHTML;
        tbodyElement.appendChild(tr);
    });
}

async function fetchAndRenderData() {
    spinner.style.display = 'block';
    tabelaConferentesBody.innerHTML = `<tr><td colspan="5">Carregando...</td></tr>`;
    tabelaFornecedoresBody.innerHTML = `<tr><td colspan="4">Carregando...</td></tr>`;

    const filtros = {
        dataInicio: document.getElementById('filtro-data-inicio').value,
        dataFim: document.getElementById('filtro-data-fim').value,
    };

    if (!filtros.dataInicio && !filtros.dataFim) {
        showToast("Por favor, selecione um período para a consulta.", "info");
        spinner.style.display = 'none';
        tabelaConferentesBody.innerHTML = `<tr><td colspan="5">Aplique um filtro para visualizar os dados.</td></tr>`;
        tabelaFornecedoresBody.innerHTML = `<tr><td colspan="4">Aplique um filtro para visualizar os dados.</td></tr>`;
        return;
    }

    try {
        const response = await fetch('/api/conferencias/dashboard-data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(filtros),
        });

        if (!response.ok) throw new Error('Falha ao buscar dados.');

        const data = await response.json();

        // ATUALIZAÇÃO AQUI: Adicionada a chave 'total_itens' na lista de colunas
        renderTable(
            tabelaConferentesBody,
            data.conferentes,
            ['nome', 'count', 'volumes', 'total_itens', 'avg_time_str']
        );

        // Renderiza Fornecedores (mantém como estava ou adiciona itens lá também se desejar)
        renderTable(
            tabelaFornecedoresBody,
            data.fornecedores,
            ['nome', 'count', 'volumes', 'divergencias']
        );

    } catch (error) {
        console.error(error);
        showToast(error.message, 'error');
        tabelaConferentesBody.innerHTML = `<tr><td colspan="5" style="color: var(--clr-danger);">Erro ao carregar.</td></tr>`;
        tabelaFornecedoresBody.innerHTML = `<tr><td colspan="4" style="color: var(--clr-danger);">Erro ao carregar.</td></tr>`;
    } finally {
        spinner.style.display = 'none';
    }
}

export function initDashboardConferenciasPage() {
    formFiltros = document.getElementById('form-filtros-conferencia-dash');
    spinner = document.getElementById('loading-spinner-dashboard');
    const btnLimpar = document.getElementById('btn-limpar-filtros');
    tabelaConferentesBody = document.querySelector('#tabela-conferentes-dash tbody');
    tabelaFornecedoresBody = document.querySelector('#tabela-fornecedores-dash tbody');

    if (!formFiltros) return;

    formFiltros.addEventListener('submit', (e) => {
        e.preventDefault();
        fetchAndRenderData();
    });

    btnLimpar.addEventListener('click', () => {
        formFiltros.reset();
        tabelaConferentesBody.innerHTML = `<tr><td colspan="5">Aplique um filtro para visualizar os dados.</td></tr>`;
        tabelaFornecedoresBody.innerHTML = `<tr><td colspan="4">Aplique um filtro para visualizar os dados.</td></tr>`;
    });

    // Estado inicial
    tabelaConferentesBody.innerHTML = `<tr><td colspan="5">Aplique um filtro para visualizar os dados.</td></tr>`;
    tabelaFornecedoresBody.innerHTML = `<tr><td colspan="4">Aplique um filtro para visualizar os dados.</td></tr>`;
}