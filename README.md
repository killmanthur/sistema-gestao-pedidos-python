# Quadro de Pedidos — Sistema de Gestão Interna

Sistema web completo para gestão centralizada de compras, logística e conferência de mercadorias em rede local. Cobre todo o fluxo desde requisições de vendedores até a entrada no estoque, com indicadores em tempo real via WebSocket.

---

## Funcionalidades

### Compras
| Módulo | Descrição |
|---|---|
| Pedidos de Rua | Requisições de produtos feitas por vendedores |
| Orçamentos | Atualização de preços e disponibilidade |
| Sugestão de Compras | Controle de necessidades de reposição |
| Pedidos a Caminho | Monitoramento de ordens em trânsito |
| Histórico de Compras | Análise de negociações com fornecedores |
| Registro de Compras | Consolidação de compras realizadas |

### Logística
| Módulo | Descrição |
|---|---|
| Separações | Fila organizada com atribuição de responsáveis |
| Conferência de Notas | Validação de NF-e (entrada e saída) |
| Painel TV | Interface otimizada para monitores no armazém (`/tv-expedicao`) |
| Gestão de Pendências | Tratamento de avarias e divergências |

### Administração
| Módulo | Descrição |
|---|---|
| Dashboard | Gráficos de performance por vendedor, comprador e período |
| Notificações | Alertas em tempo real via Socket.IO |
| Lixeira | Recuperação de itens excluídos |
| Logs de Auditoria | Rastreamento completo de ações por usuário |
| Configurações | Listas dinâmicas, parâmetros do sistema |
| Gestão de Usuários | Controle de acesso e permissões |

---

## Tecnologias

| Camada | Stack |
|---|---|
| **Backend** | Python 3.10+, Flask 3, SQLAlchemy 2, Flask-Migrate, Waitress |
| **Tempo Real** | Flask-SocketIO, python-socketio, python-engineio |
| **Banco de Dados** | SQLite (local) + Google Cloud Firestore (sincronização) |
| **Storage** | Google Cloud Storage |
| **Auth** | PyJWT, Firebase Admin SDK |
| **Frontend** | HTML5, CSS3, JavaScript ES6+, Socket.IO, Chart.js, Toastify |
| **Desktop** | pywebview (wrapper opcional para app desktop) |
| **WSGI** | Waitress (produção) |

---

## Instalação

### Pré-requisitos
- Python 3.10+
- pip

### Passos

```bash
# Clone o repositório
git clone https://github.com/seu-usuario/quadro-de-pedidos.git
cd quadro-de-pedidos

# Crie e ative o ambiente virtual
python -m venv venv
source venv/bin/activate        # Linux/Mac
venv\Scripts\activate           # Windows

# Instale as dependências
pip install -r requirements.txt

# Inicie o servidor
python run.py
```

Acesse: **http://localhost:52080**

> O banco de dados SQLite é criado automaticamente no primeiro acesso.

---

## Configuração Inicial

1. Acesse o sistema pela primeira vez
2. Crie o usuário administrador
3. Atribua a permissão **Administrador de Sistema**
4. (Opcional) Configure credenciais do Firebase/Firestore em `configuracoes` para sincronização em nuvem

---

## Estrutura do Projeto

```
quadro_app/
├── blueprints/
│   ├── pedidos.py              # Pedidos de rua e orçamentos
│   ├── separacoes.py           # Módulo de separações
│   ├── conferencias.py         # Conferência de notas fiscais
│   ├── sugestoes.py            # Sugestões de compra
│   ├── registro_compras.py     # Histórico e registro de compras
│   ├── dashboard.py            # Indicadores e gráficos
│   ├── notificacoes.py         # Sistema de notificações
│   ├── usuarios.py             # Autenticação e permissões
│   ├── admin.py                # Administração do sistema
│   ├── lixeira.py              # Recuperação de itens
│   ├── logs.py                 # Auditoria
│   ├── configuracoes.py        # Configurações gerais
│   ├── listas_dinamicas.py     # Listas configuráveis
│   └── main_views.py           # Rotas principais
├── models.py                   # Modelos ORM (SQLAlchemy)
├── extensions.py               # Inicialização de extensões Flask
└── __init__.py                 # Factory da aplicação

static/
├── js/
│   ├── pages/                  # Lógica por página
│   ├── apiClient.js            # Cliente HTTP centralizado
│   ├── auth.js                 # Fluxo de autenticação
│   ├── ui.js                   # Componentes de interface
│   ├── forms.js                # Manipulação de formulários
│   └── main.js                 # Inicialização global
└── style.css                   # Estilos globais

templates/                      # Templates Jinja2
migrations/                     # Migrações Alembic
run.py                          # Ponto de entrada
requirements.txt                # Dependências Python
quadro_local.db                 # Banco SQLite (auto-gerado, não versionado)
```

---

## Recursos da Interface

- **Modo Escuro** — tema persistido via `localStorage`
- **Painel TV** — rota `/tv-expedicao` otimizada para monitores do armazém
- **Atualizações em tempo real** — sem necessidade de recarregar a página
- **Notificações toast** — feedback visual imediato para todas as ações

---

Desenvolvido para otimizar processos logísticos e de compras em redes locais.
