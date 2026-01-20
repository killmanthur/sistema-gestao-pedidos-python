// static/js/pages/historico.js
import { criarCardPedido, setupLogModal } from '../ui.js';
import { showToast } from '../toasts.js';

// --- Variáveis de Estado Independentes para cada coluna ---
const TAMANHO_PAGINA = 20;

// Estado para a coluna Pedidos Rua
const estadoRua = {
    pagina: 0,
    temMais: true,
    carregando: false
};

// Estado para a coluna Orçamentos
const estadoOrc = {
    pagina: 0,
    temMais: true,
    carregando: false
};

// --- Elementos do DOM ---
let quadroRua, quadroOrcamentos, formFiltros, btnLimpar, btnGerarRelatorio;
let relatorioContainer, relatorioOutput, btnFecharRelatorio, btnSalvarRelatorio;
let btnCarregarMais, loadingSpinner;

/**
 * Função genérica para carregar dados de uma coluna específica.
 * @param {string} tipoReq - 'Pedido Produto' ou 'Atualização Orçamento'
 * @param {object} estado - Objeto de estado (estadoRua ou estadoOrc)
 * @param {HTMLElement} container - Elemento DOM onde os cards serão inseridos
 * @param {boolean} recarregar - Se deve limpar e recomeçar
 */
async function carregarColuna(tipoReq, estado, container, recarregar = false) {
    // Se já está carregando ou não tem mais dados (e não é um reload forçado), sai.
    if (estado.carregando || (!recarregar && !estado.temMais)) return;

    estado.carregando = true;

    if (recarregar) {
        estado.pagina = 0;
        estado.temMais = true;
        container.innerHTML = ''; // Limpa a coluna visualmente
    }

    // Coleta os filtros
    const filtros = {
        vendedor: document.getElementById('filtro-vendedor') ? document.getElementById('filtro-vendedor').value : '',
        comprador: document.getElementById('filtro-comprador') ? document.getElementById('filtro-comprador').value : '',
        codigo: document.getElementById('filtro-codigo') ? document.getElementById('filtro-codigo').value : '',
        dataInicio: document.getElementById('filtro-data-inicio') ? document.getElementById('filtro-data-inicio').value : '',
        dataFim: document.getElementById('filtro-data-fim') ? document.getElementById('filtro-data-fim').value : '',

        // Parâmetros de paginação e tipo
        page: estado.pagina,
        limit: TAMANHO_PAGINA,
        tipo_req: tipoReq
    };

    try {
        const response = await fetch('/api/historico-paginado', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(filtros)
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || `Erro ao buscar ${tipoReq}`);

        if (data.pedidos.length === 0 && estado.pagina === 0) {
            container.innerHTML = `<p class="quadro-vazio-msg">Nenhum registro encontrado.</p>`;
        } else {
            // Remove a mensagem de vazio se existir e for adicionar itens
            const emptyMsg = container.querySelector('.quadro-vazio-msg');
            if (emptyMsg) emptyMsg.remove();

            data.pedidos.forEach(pedido => {
                container.appendChild(criarCardPedido(pedido));
            });
        }

        estado.temMais = data.temMais;
        if (estado.temMais) {
            estado.pagina++;
        }

    } catch (error) {
        console.error(`Erro ao carregar ${tipoReq}:`, error);
        showToast(`Erro ao carregar coluna ${tipoReq}`, "error");
        if (estado.pagina === 0) {
            container.innerHTML = `<p class="quadro-vazio-msg" style="color:var(--clr-danger)">Erro de conexão.</p>`;
        }
    } finally {
        estado.carregando = false;
        atualizarEstadoBotao();
    }
}

/**
 * Controla a visibilidade do botão "Carregar Mais" e do Spinner.
 * O botão só deve sumir se AMBAS as colunas não tiverem mais dados.
 */
function atualizarEstadoBotao() {
    const algumCarregando = estadoRua.carregando || estadoOrc.carregando;
    const algumTemMais = estadoRua.temMais || estadoOrc.temMais;

    if (loadingSpinner) loadingSpinner.style.display = algumCarregando ? 'block' : 'none';

    if (btnCarregarMais) {
        // Mostra o botão se não estiver carregando E se pelo menos uma coluna tiver mais dados
        if (!algumCarregando && algumTemMais) {
            btnCarregarMais.style.display = 'block';
        } else {
            btnCarregarMais.style.display = 'none';
        }
    }
}

/**
 * Função principal chamada para iniciar ou continuar o carregamento.
 */
function carregarTudo(recarregar = false) {
    if (loadingSpinner) loadingSpinner.style.display = 'block';
    if (btnCarregarMais) btnCarregarMais.style.display = 'none';

    // Dispara as duas requisições em paralelo
    Promise.all([
        carregarColuna('Pedido Produto', estadoRua, quadroRua, recarregar),
        carregarColuna('Atualização Orçamento', estadoOrc, quadroOrcamentos, recarregar)
    ]).then(() => {
        // Ambas terminaram (com sucesso ou erro)
        atualizarEstadoBotao();
    });
}

// ... (Funções de Relatório permanecem iguais) ...
async function gerarRelatorio() {
    showToast("Gerando relatório no servidor. Aguarde...", 'info');
    if (btnGerarRelatorio) btnGerarRelatorio.disabled = true;
    if (loadingSpinner) loadingSpinner.style.display = 'block';

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

        if (relatorioOutput) relatorioOutput.textContent = result.relatorio;
        if (relatorioContainer) relatorioContainer.style.display = 'block';

    } catch (error) {
        console.error("Erro ao gerar relatório:", error);
        showToast(`Falha ao gerar relatório: ${error.message}`, "error");
    } finally {
        if (btnGerarRelatorio) btnGerarRelatorio.disabled = false;
        if (loadingSpinner) loadingSpinner.style.display = 'none';
    }
}

async function salvarRelatorio() {
    const texto = relatorioOutput.textContent;
    if (!texto) {
        showToast("Não há relatório para salvar.", "error");
        return;
    }

    try {
        const response = await fetch('/api/download-relatorio', {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain'
            },
            body: texto
        });

        if (!response.ok) throw new Error('Falha ao gerar o arquivo no servidor.');

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;

        let filename = `relatorio-${new Date().toISOString().split('T')[0]}.txt`;
        const contentDisposition = response.headers.get('content-disposition');
        if (contentDisposition && contentDisposition.indexOf('attachment') !== -1) {
            const matches = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(contentDisposition);
            if (matches != null && matches[1]) {
                filename = matches[1].replace(/['"]/g, '');
            }
        }
        a.download = filename;

        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        showToast('Download do relatório iniciado!', 'success');

    } catch (e) {
        console.error("Erro ao salvar relatório:", e);
        showToast("Não foi possível salvar o relatório.", "error");
    }
}

async function baixarCSV() {
    showToast("Gerando CSV de peças...", "info");

    // Pega os mesmos filtros do formulário
    const filtros = {
        vendedor: document.getElementById('filtro-vendedor').value,
        comprador: document.getElementById('filtro-comprador').value,
        codigo: document.getElementById('filtro-codigo').value,
        dataInicio: document.getElementById('filtro-data-inicio').value,
        dataFim: document.getElementById('filtro-data-fim').value
    };

    try {
        const response = await fetch('/api/relatorio-csv', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(filtros)
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Erro ao gerar CSV');
        }

        // Lógica padrão para download de BLOB (arquivo)
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `relatorio_pecas_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        showToast("Download do CSV iniciado!", "success");

    } catch (error) {
        console.error(error);
        showToast(`Erro: ${error.message}`, 'error');
    }
}

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

    const btnCSV = document.getElementById('btn-baixar-csv');
    if (btnCSV) {
        btnCSV.addEventListener('click', baixarCSV);
    }

    btnCarregarMais = document.getElementById('btn-carregar-mais');
    loadingSpinner = document.getElementById('loading-spinner');

    if (!quadroRua || !quadroOrcamentos) {
        console.error("Elementos do quadro histórico não encontrados.");
        return;
    }

    if (formFiltros) {
        formFiltros.addEventListener('submit', (e) => {
            e.preventDefault();
            if (relatorioContainer) relatorioContainer.style.display = 'none';
            carregarTudo(true); // true = recarregar (limpar e buscar pág 0)
        });
    }

    if (btnLimpar) {
        btnLimpar.addEventListener('click', () => {
            formFiltros.reset();
            if (relatorioContainer) relatorioContainer.style.display = 'none';
            carregarTudo(true);
        });
    }

    if (btnCarregarMais) {
        btnCarregarMais.addEventListener('click', () => carregarTudo(false)); // false = carregar próxima página
    }

    if (btnGerarRelatorio) btnGerarRelatorio.addEventListener('click', gerarRelatorio);
    if (btnFecharRelatorio) btnFecharRelatorio.addEventListener('click', () => relatorioContainer.style.display = 'none');
    if (btnSalvarRelatorio) btnSalvarRelatorio.addEventListener('click', salvarRelatorio);

    // Carrega a primeira página de dados ao entrar
    carregarTudo(true);
}