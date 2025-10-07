# Quadro de Pedidos e Logística

![Quadro de Pedidos](https://img.shields.io/badge/Status-Em_Desenvolvimento-yellow)
![Python](https://img.shields.io/badge/Python-3.9+-blue.svg)
![Flask](https://img.shields.io/badge/Flask-2.x-green.svg)
![Firebase](https://img.shields.io/badge/Firebase-Realtime_DB-orange.svg)

O **Quadro de Pedidos e Logística** é uma aplicação web completa desenvolvida para otimizar e digitalizar o fluxo de trabalho de uma empresa, desde a criação de requisições de compra até a expedição de produtos. A ferramenta centraliza informações, melhora a comunicação entre equipes (Vendas, Compras, Estoque, Logística) e fornece dados para análise de desempenho.

## 📋 Funcionalidades Principais

A plataforma é dividida em módulos que cobrem todo o ciclo de vida de um pedido:

### **Compras**
*   **Quadro Ativo:** Visualização em tempo real (Kanban) de todos os pedidos de rua e atualizações de orçamento que estão em aberto.
*   **Criação de Pedidos:** Formulários intuitivos para que vendedores criem requisições de compra de produtos ou solicitem atualizações de orçamento.
*   **Sugestão de Compras:** Um quadro dedicado para que vendedores sugiram itens para compra, permitindo que a equipe de compras analise, cogite e atenda as sugestões.
*   **Histórico:** Um arquivo pesquisável de todos os pedidos finalizados, com filtros avançados e capacidade de gerar relatórios.
*   **Dashboard (Vendas):** Gráficos e métricas sobre o volume de pedidos por vendedor, comprador e período.

### **Logística**
*   **Recebimento de Mercadorias:** Registro de entrada de notas fiscais de fornecedores e da rua, iniciando o fluxo de conferência.
*   **Conferência de Espelhos:** Um quadro para a equipe de estoque gerenciar a conferência de produtos recebidos.
*   **Pendências e Alterações:** Painel centralizado para resolver divergências encontradas na conferência, separando problemas de fornecedor e problemas de lançamento (contabilidade).
*   **Separações:** Um quadro Kanban para gerenciar o processo de separação de produtos para expedição, com um sistema de fila de prioridade para os separadores.
*   **Dashboard de Logística:** Métricas de desempenho da equipe, incluindo contagem de separações/conferências e tempo médio de execução por colaborador.

### **Gestão**
*   **Gerenciamento de Usuários:** Painel de administração para criar, editar, excluir usuários e gerenciar permissões detalhadas de acesso a cada página e funcionalidade do sistema.

## 🛠️ Tecnologias Utilizadas

*   **Backend:**
    *   **Python 3** com o micro-framework **Flask**.
    *   **PyWebView** para encapsular a aplicação Flask em um executável desktop para Windows.
*   **Frontend:**
    *   **HTML5**, **CSS3** (Vanilla) e **JavaScript (ES6 Modules)**.
    *   **Jinja2** para template rendering.
    *   **Chart.js** para a visualização de gráficos nos dashboards.
*   **Banco de Dados:**
    *   **Firebase Realtime Database** para armazenamento de dados e sincronização em tempo real (onde aplicável).
    *   **Firebase Authentication** para gerenciamento de login e autenticação de usuários.

## 🚀 Como Executar o Projeto

### Pré-requisitos

-   Python 3.9 ou superior.
-   `pip` (gerenciador de pacotes do Python).
-   Uma conta no Firebase com um projeto Realtime Database e Authentication configurados.

### Passos para Instalação

1.  **Clone o repositório:**
    ```bash
    git clone https://[URL-DO-SEU-REPOSITORIO].git
    cd quadro-de-pedidos-e-logistica
    ```

2.  **Crie e ative um ambiente virtual:**
    ```bash
    # Windows
    python -m venv venv
    .\venv\Scripts\activate

    # macOS / Linux
    python3 -m venv venv
    source venv/bin/activate
    ```

3.  **Instale as dependências:**
    ```bash
    pip install -r requirements.txt
    ```
    *(Nota: Se o arquivo `requirements.txt` não existir, você precisará instalar as bibliotecas manualmente: `pip install Flask firebase-admin pywebview`)*

4.  **Configure o Firebase:**
    *   Faça o download do seu arquivo de credenciais `serviceAccountKey.json` do console do Firebase.
    *   Coloque este arquivo na pasta raiz do projeto (`quadro_app/`).

5.  **Execute a aplicação:**
    ```bash
    python run.py
    ```
    Isso iniciará o servidor Flask e abrirá a janela do PyWebView com a aplicação rodando.

### Modo TV

Para iniciar a aplicação em tela cheia sem os menus de navegação (ideal para monitores em áreas de trabalho), execute com o argumento `--tv`:
```bash
python run.py --tv