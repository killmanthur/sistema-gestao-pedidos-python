# Quadro de Pedidos - Sistema de Gestão Interna

## 📜 Visão Geral

O **Quadro de Pedidos** é uma aplicação web completa, construída com Flask e Firebase, projetada para otimizar e digitalizar os fluxos de trabalho internos de uma empresa. O sistema gerencia desde a criação de requisições de compra e sugestões até o complexo processo logístico de recebimento, conferência, separação e resolução de pendências.

A interface é reativa e em tempo real, fornecendo aos usuários uma visão sempre atualizada do status das operações, com um robusto sistema de permissões para garantir que cada colaborador acesse apenas as funcionalidades relevantes ao seu cargo.

## ✨ Funcionalidades Principais

-   **Módulo de Compras:**
    -   Criação de **Pedidos de Rua** (múltiplos itens) e **Atualizações de Orçamento**.
    -   Quadro ativo com visualização em tempo real do status dos pedidos (`Aguardando`, `Em Cotação`, `OK`).
    -   Sistema de **Sugestão de Compras** com fluxo de status (`Pendente`, `Cogitado`, `Parcialmente Atendido`, `Finalizado`).
    -   Atribuição de pedidos a compradores específicos.

-   **Módulo de Logística:**
    -   **Recebimento de Mercadorias:** Registro detalhado de notas fiscais de fornecedores e da rua, com campo "Recebido por".
    -   **Conferência:** Fluxo para conferentes verificarem as mercadorias recebidas.
    -   **Pendências e Alterações:** Uma área dedicada para a contabilidade e o estoque resolverem divergências (itens faltantes, erros de lançamento), com ordenação por data e paginação.
    -   **Separações:** Sistema de separação de mercadorias com uma **fila de prioridade** gerenciável para os separadores.

-   **Gestão e Análise:**
    -   **Dashboard Analítico:** Gráficos que exibem atividade mensal, pedidos por vendedor e atendimentos por comprador, com filtros por data e usuário.
    -   **Histórico Completo:** Arquivo de todos os pedidos finalizados com filtros avançados e capacidade de gerar relatórios em texto.
    -   **Gerenciamento de Usuários:** Interface de administrador para criar, editar, excluir e definir permissões granulares para cada usuário e role.

-   **Recursos da Plataforma:**
    -   **Autenticação Segura** via Firebase.
    -   **Notificações em Tempo Real** no sistema (ícone de sino) e no navegador.
    -   **Interface Responsiva** com tema claro e escuro (Dark Mode).
    -   Empacotado como uma aplicação de desktop usando **PyWebView** para fácil distribuição.

## 🛠️ Tecnologias Utilizadas

-   **Backend:** Python com **Flask**
-   **Frontend:** HTML5, CSS3, JavaScript (Vanilla JS, modularizado)
-   **Templating:** Jinja2
-   **Banco de Dados e Realtime:** Firebase Realtime Database
-   **Autenticação:** Firebase Authentication
-   **Aplicação Desktop:** PyWebView

## 🚀 Configuração e Instalação

1.  **Pré-requisitos:**
    -   Python 3.8+
    -   `pip` e `venv`

2.  **Clonar o Repositório:**
    ```bash
    git clone https://[URL_DO_SEU_REPOSITORIO].git
    cd quadro-de-pedidos
    ```

3.  **Criar e Ativar um Ambiente Virtual:**
    ```bash
    python -m venv venv
    # Windows
    .\venv\Scripts\activate
    # macOS/Linux
    source venv/bin/activate
    ```

4.  **Instalar as Dependências:**
    ```bash
    pip install Flask firebase-admin pywebview
    ```

5.  **Configurar o Firebase:**
    -   Crie um projeto no [Firebase Console](https://console.firebase.google.com/).
    -   Ative o **Realtime Database** e o **Authentication** (com E-mail/Senha).
    -   Vá em "Configurações do Projeto" > "Contas de serviço".
    -   Clique em "Gerar nova chave privada" e baixe o arquivo JSON.
    -   Renomeie este arquivo para `serviceAccountKey.json` e coloque-o na raiz do projeto.

6.  **Executar a Aplicação:**
    ```bash
    python run.py
    ```
    - Para iniciar em modo tela cheia (modo TV), use o argumento `--tv`:
    ```bash
    python run.py --tv
    ```

## 📂 Estrutura do Projeto

```
.
├── quadro_app/
│   ├── blueprints/       # Organização das rotas da API e views
│   ├── static/
│   │   ├── css/
│   │   └── js/           # Scripts modulares (auth, ui, pages, etc.)
│   ├── templates/        # Arquivos HTML com Jinja2
│   ├── __init__.py       # Inicialização da aplicação Flask
│   └── utils.py          # Funções utilitárias (logs, notificações)
├── run.py                # Ponto de entrada para iniciar a aplicação
├── serviceAccountKey.json # Chave de serviço do Firebase (NÃO versionar)
└── README.md
```