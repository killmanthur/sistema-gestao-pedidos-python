📦 Quadro de Pedidos - Sistema de Gestão Interna
O Quadro de Pedidos é uma plataforma web completa para gestão de fluxo de compras, logística e conferência de mercadorias. Projetado para operar em rede local, o sistema centraliza desde a requisição de um vendedor até a finalização da conferência no estoque, com indicadores em tempo real.
🚀 Funcionalidades Principais
🛒 Módulo de Compras
Pedidos de Rua: Registro de requisições de produtos por parte dos vendedores.
Atualização de Orçamentos: Fluxo para atualização de preços e disponibilidades.
Sugestão de Compras: Canal para indicar produtos necessários ao estoque.
Pedidos a Caminho: Monitoramento de ordens de compra já efetuadas.
Registro de Compras: Histórico analítico de negociações com fornecedores.
🚛 Módulo de Logística (Expedição & Estoque)
Gerenciador de Separações: Fila organizada de separação de mercadorias com atribuição de responsáveis.
Conferência de Notas: Fluxo de conferência de NF-e (Entrada e Saída).
Painel TV Expedição: Interface otimizada para monitoramento em telas grandes no armazém.
Gestão de Pendências: Tratamento de avarias, faltas ou erros de lançamento.
📊 Inteligência e Gestão
Dashboards: Gráficos de performance de vendedores, compradores, separadores e conferentes (via Chart.js).
Relatórios Analíticos: Geração de relatórios em texto para auditoria e arquivamento.
Lixeira (Soft Delete): Sistema de recuperação de itens excluídos acidentalmente.
Logs de Auditoria: Histórico detalhado de "quem fez o quê" em cada pedido ou conferência.
🛠️ Tecnologias Utilizadas
Backend:
Python + Flask (Micro-framework)
SQLAlchemy (ORM)
SQLite (Banco de dados local)
Flask-SocketIO (Comunicação em tempo real)
Frontend:
HTML5 / CSS3 (Variáveis CSS, Flexbox, Grid)
JavaScript Moderno (ES6 Modules, Vanilla JS)
Socket.IO (Cliente)
Chart.js (Gráficos)
Toastify JS (Notificações flutuantes)
📦 Instalação e Configuração
Pré-requisitos
Python 3.10 ou superior instalado.
Passo a Passo
Clone o repositório:
code
Bash
git clone https://github.com/seu-usuario/quadro-de-pedidos.git
cd quadro-de-pedidos
Crie e ative um ambiente virtual:
code
Bash
python -m venv venv
# Windows:
venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate
Instale as dependências:
code
Bash
pip install -r requirements.txt
Inicie o sistema:
code
Bash
python run.py
O sistema criará automaticamente o banco de dados quadro_local.db e as tabelas necessárias no primeiro acesso.
Acesse no navegador:
http://localhost:5000
🔑 Acesso Inicial (Admin)
Ao iniciar o sistema pela primeira vez, você pode criar o primeiro usuário administrador via script ou garantir que as tabelas de roles estejam configuradas.
Padrão Sugerido:
Páginas: Acesso total.
Permissões: Administrador de Sistema.
🌗 Modo Escuro & Modo TV
Dark Mode: O sistema possui suporte nativo a tema escuro, persistido no localStorage do navegador.
Modo TV: A rota /tv-expedicao esconde o menu de navegação e expande os cards para visualização à distância, ideal para monitores fixos no galpão.
📂 Estrutura de Pastas
code
Text
├── quadro_app/
│   ├── blueprints/      # Módulos da API (Rotas Python)
│   ├── static/          # CSS, JS (Modulares) e Imagens
│   ├── templates/       # Arquivos HTML (Jinja2)
│   ├── models.py        # Definição das tabelas do Banco de Dados
│   └── extensions.py    # Configurações de extensões (DB, SocketIO)
├── run.py               # Arquivo de inicialização
├── requirements.txt     # Dependências do projeto
└── quadro_local.db      # Banco de dados SQLite (Gerado automaticamente)
📝 Licença
Este projeto é de uso interno e confidencial. Todos os direitos reservados à [Nome da sua Empresa/Organização].
Desenvolvido com ❤️ para otimizar processos logísticos.