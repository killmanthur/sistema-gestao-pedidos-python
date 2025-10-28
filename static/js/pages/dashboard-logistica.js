// static/js/pages/dashboard-logistica.js

import { showToast } from '../toasts.js';

let formFiltros, spinner, tabelaSeparadoresBody, tabelaConferentesBody;

/**
 * Renderiza os dados em uma tabela específica.
 * @param {HTMLTableSectionElement} tbodyElement - O elemento tbody da tabela.
 * @param {Array} data - Os dados a serem renderizados.
 * @param {Array<string>} columns - As chaves dos dados para cada coluna.
 */
function renderTable(tbodyElement, data, columns) {
    tbodyElement.innerHTML = '';
    if (!data || data.length === 0) {
        tbodyElement.innerHTML = `<tr><td colspan="${columns.length}">Nenhum dado encontrado.</td></tr>`;
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

/**
 * Busca os dados do dashboard na API com base nos filtros.
 */
async function fetchAndRenderData() {
    spinner.style.display = 'block';
    tabelaSeparadoresBody.innerHTML = `<tr><td colspan="4">Carregando...</td></tr>`;
    tabelaConferentesBody.innerHTML = `<tr><td colspan="4">Carregando...</td></tr>`;

    const filtros = {
        dataInicio: document.getElementById('filtro-data-inicio').value,
        dataFim: document.getElementById('filtro-data-fim').value,
    };

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

        // MUDANÇA: Adicionado 'total_pecas' à lista de colunas
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

/**
 * Função principal que inicializa a página do Dashboard de Logística.
 */
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
        fetchAndRenderData();
    });

    // Carrega os dados iniciais ao entrar na página
    fetchAndRenderData();
}