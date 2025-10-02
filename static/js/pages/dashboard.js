// static/js/pages/dashboard.js

import { showToast } from '../toasts.js';

// Variáveis para guardar as instâncias dos gráficos
let lineChartInstance = null;
let pieVendedoresInstance = null;
let pieCompradoresInstance = null;

// Elementos do DOM
let formFiltros, spinner;

/**
 * Função genérica para renderizar um gráfico.
 * Destroi a instância anterior se ela existir.
 */
function renderChart(ctx, type, data, options = {}) {
    if (ctx.chartInstance) {
        ctx.chartInstance.destroy();
    }
    ctx.chartInstance = new Chart(ctx, { type, data, options });
}

/**
 * Busca os dados do dashboard na API com base nos filtros.
 */
async function fetchAndRenderData() {
    spinner.style.display = 'block';

    const filtros = {
        dataInicio: document.getElementById('filtro-data-inicio').value,
        dataFim: document.getElementById('filtro-data-fim').value,
        vendedor: document.getElementById('filtro-vendedor').value,
        comprador: document.getElementById('filtro-comprador').value,
    };

    try {
        const response = await fetch('/api/dashboard-data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(filtros),
        });

        if (!response.ok) {
            throw new Error('Falha ao buscar dados para o dashboard.');
        }

        const data = await response.json();

        // Renderiza o gráfico de linha
        const lineCtx = document.getElementById('lineChart');
        if (lineCtx) {
            renderChart(lineCtx, 'line', data.lineChart);
        }

        // Renderiza o gráfico de pizza de Vendedores
        const pieVendedoresCtx = document.getElementById('pieChartVendedores');
        if (pieVendedoresCtx) {
            renderChart(pieVendedoresCtx, 'pie', {
                labels: data.pieChartVendedores.labels,
                datasets: [{
                    label: 'Pedidos',
                    data: data.pieChartVendedores.data,
                    backgroundColor: ['#3B71CA', '#5cb85c', '#f0ad4e', '#d9534f', '#5bc0de', '#0275d8'],
                }]
            });
        }
        
        // Renderiza o gráfico de pizza de Compradores
        const pieCompradoresCtx = document.getElementById('pieChartCompradores');
        if (pieCompradoresCtx) {
            renderChart(pieCompradoresCtx, 'pie', {
                labels: data.pieChartCompradores.labels,
                datasets: [{
                    label: 'Pedidos Atendidos',
                    data: data.pieChartCompradores.data,
                    backgroundColor: ['#3B71CA', '#5cb85c', '#f0ad4e', '#d9534f', '#5bc0de', '#0275d8'].reverse(),
                }]
            });
        }

    } catch (error) {
        console.error(error);
        showToast(error.message, 'error');
    } finally {
        spinner.style.display = 'none';
    }
}

/**
 * Função principal que inicializa a página do Dashboard.
 */
export function initDashboardPage() {
    formFiltros = document.getElementById('form-filtros-dashboard');
    spinner = document.getElementById('loading-spinner-dashboard');
    const btnLimpar = document.getElementById('btn-limpar-filtros');

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