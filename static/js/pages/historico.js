// static/js/pages/historico.js
// Responsabilidade: Lógica da página de Histórico com carregamento e filtragem no servidor.

import { criarCardPedido, setupLogModal } from '../ui.js'; 
import { showToast } from '../toasts.js';

// --- Variáveis de Estado ---
const TAMANHO_PAGINA = 20;
let paginaAtual = 0;
let carregandoMais = false;
let naoHaMaisPedidos = false;
let filtrosAtuais = {};

// --- Elementos do DOM ---
let quadroRua, quadroOrcamentos, formFiltros, btnLimpar, btnGerarRelatorio;
let relatorioContainer, relatorioOutput, btnFecharRelatorio, btnSalvarRelatorio;
let btnCarregarMais, loadingSpinner, paginationContainer;

/**
 * Renderiza os cards de pedidos recebidos da API nas colunas corretas.
 * @param {Array} pedidos - Uma lista de objetos de pedido.
 * @param {boolean} limpar - Se true, limpa as colunas antes de adicionar novos cards.
 */
function renderizarPedidos(pedidos, limpar = false) {
    if (limpar) {
        quadroRua.innerHTML = '';
        quadroOrcamentos.innerHTML = '';
    }

    if (pedidos.length === 0 && paginaAtual === 0) {
        quadroRua.innerHTML = `<p class="quadro-vazio-msg">Nenhum pedido de rua finalizado com estes filtros.</p>`;
        quadroOrcamentos.innerHTML = `<p class="quadro-vazio-msg">Nenhuma atualização de orçamento finalizada com estes filtros.</p>`;
    }

    pedidos.forEach(pedido => {
        const card = criarCardPedido(pedido);
        if (pedido.tipo_req === 'Pedido Produto') {
            quadroRua.appendChild(card);
        } else {
            quadroOrcamentos.appendChild(card);
        }
    });
}

/**
 * Busca a próxima página de pedidos do backend.
 * @param {boolean} recarregar - Se true, inicia a busca da primeira página.
 */
async function carregarHistorico(recarregar = false) {
    if (carregandoMais) return;
    if (!recarregar && naoHaMaisPedidos) {
        showToast('Não há mais pedidos antigos para carregar.', 'info');
        return;
    }

    carregandoMais = true;
    loadingSpinner.style.display = 'block';
    btnCarregarMais.style.display = 'none';

    if (recarregar) {
        paginaAtual = 0;
        naoHaMaisPedidos = false;
        filtrosAtuais = {
            vendedor: document.getElementById('filtro-vendedor').value,
            comprador: document.getElementById('filtro-comprador').value,
            codigo: document.getElementById('filtro-codigo').value,
            dataInicio: document.getElementById('filtro-data-inicio').value,
            dataFim: document.getElementById('filtro-data-fim').value
        };
    }

    const body = {
        ...filtrosAtuais,
        page: paginaAtual,
        limit: TAMANHO_PAGINA
    };

    try {
        const response = await fetch('/api/historico-paginado', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Falha ao buscar histórico.');

        renderizarPedidos(data.pedidos, recarregar);
        
        naoHaMaisPedidos = !data.temMais;
        if (!naoHaMaisPedidos) {
            paginaAtual++;
        }

    } catch (error) {
        console.error("Erro ao carregar histórico:", error);
        showToast(error.message, "error");
    } finally {
        carregandoMais = false;
        loadingSpinner.style.display = 'none';
        btnCarregarMais.style.display = naoHaMaisPedidos ? 'none' : 'block';
    }
}

/**
 * Pede ao backend para gerar um relatório com os filtros atuais.
 */
async function gerarRelatorio() {
    showToast("Gerando relatório no servidor. Aguarde...", 'info');
    btnGerarRelatorio.disabled = true;
    loadingSpinner.style.display = 'block';

    const filtros = {
        vendedor: document.getElementById('filtro-vendedor').value,
        comprador: document.getElementById('filtro-comprador').value,
        codigo: document.getElementById('filtro-codigo').value,
        dataInicio: document.getElementById('filtro-data-inicio').value,
        dataFim: document.getElementById('filtro-data-fim').value
    };

    try {
        const response = await fetch('/api/relatorio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(filtros)
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Erro desconhecido no servidor.');

        relatorioOutput.textContent = result.relatorio;
        relatorioContainer.style.display = 'block';

    } catch (error) {
        console.error("Erro ao gerar relatório:", error);
        showToast(`Falha ao gerar relatório: ${error.message}`, "error");
    } finally {
        btnGerarRelatorio.disabled = false;
        loadingSpinner.style.display = 'none';
    }
}

/**
 * Salva o relatório gerado em um arquivo de texto.
 */
async function salvarRelatorio() {
    const texto = relatorioOutput.textContent;
    if (!texto) {
        showToast("Não há relatório para salvar.", "error");
        return;
    }
    if (window.pywebview?.api?.save_file_dialog) {
        try {
            const result = await window.pywebview.api.save_file_dialog(texto);
            if (result.status === 'success') showToast('Relatório salvo com sucesso!', 'success');
        } catch (e) {
            showToast("Ocorreu um erro de comunicação ao tentar salvar o arquivo.", "error");
        }
    } else {
        showToast('A função de salvar só está disponível na aplicação desktop.', 'info');
    }
}

/**
 * Função principal que inicializa a página de Histórico.
 */
export function initHistoricoPage() {
    setupLogModal();
    quadroRua = document.getElementById('quadro-historico-rua');
    quadroOrcamentos = document.getElementById('quadro-historico-orcamentos');
    formFiltros = document.getElementById('form-filtros');
    btnLimpar = document.getElementById('btn-limpar-filtros');
    btnGerarRelatorio = document.getElementById('btn-gerar-relatorio');
    relatorioContainer = document.getElementById('relatorio-container');
    relatorioOutput = document.getElementById('relatorio-output');
    btnFecharRelatorio = document.getElementById('btn-fechar-relatorio');
    btnSalvarRelatorio = document.getElementById('btn-salvar-relatorio');
    btnCarregarMais = document.getElementById('btn-carregar-mais');
    loadingSpinner = document.getElementById('loading-spinner');
    paginationContainer = document.getElementById('pagination-container');

    if (!formFiltros || !btnCarregarMais) return;

    formFiltros.addEventListener('submit', (e) => { 
        e.preventDefault();
        relatorioContainer.style.display = 'none';
        carregarHistorico(true);
    });

    btnLimpar.addEventListener('click', () => { 
        formFiltros.reset();
        relatorioContainer.style.display = 'none';
        carregarHistorico(true);
    });
    
    btnCarregarMais.addEventListener('click', () => carregarHistorico(false));

    btnGerarRelatorio.addEventListener('click', gerarRelatorio);
    btnFecharRelatorio.addEventListener('click', () => relatorioContainer.style.display = 'none');
    btnSalvarRelatorio.addEventListener('click', salvarRelatorio);

    // Carrega a primeira página de dados ao entrar
    carregarHistorico(true);
}