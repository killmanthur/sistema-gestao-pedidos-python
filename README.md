# 📦 Quadro de Pedidos - Sistema de Gestão Interna

Sistema web completo para gestão centralizada de compras, logística e conferência de mercadorias em rede local. Monitore todo o fluxo desde requisições de vendedores até finalização do estoque com indicadores em tempo real.

## 🚀 Funcionalidades Principais

### 🛒 Módulo de Compras
- **Pedidos de Rua** - Requisições de produtos por vendedores
- **Orçamentos** - Atualização de preços e disponibilidades
- **Sugestão de Compras** - Produtos necessários ao estoque
- **Pedidos em Trânsito** - Monitoramento de ordens efetuadas
- **Histórico de Compras** - Análise de negociações com fornecedores

### 🚛 Módulo de Logística
- **Gerenciador de Separações** - Fila organizada com atribuição de responsáveis
- **Conferência de Notas** - Fluxo de validação (NF-e entrada/saída)
- **Painel TV** - Interface otimizada para monitores no armazém
- **Gestão de Pendências** - Tratamento de avarias e erros

### 📊 Inteligência e Relatórios
- **Dashboards** - Gráficos de performance (vendedores, compradores, etc.)
- **Relatórios Analíticos** - Exportação para auditoria
- **Lixeira** - Recuperação de itens excluídos
- **Logs de Auditoria** - Rastreamento completo de ações

## 🛠️ Tecnologias

| Camada | Tecnologias |
|--------|------------|
| **Backend** | Python 3.10+, Flask, SQLAlchemy, SQLite, Flask-SocketIO |
| **Frontend** | HTML5, CSS3, JavaScript (ES6), Socket.IO, Chart.js, Toastify |

## 📋 Instalação Rápida

### Pré-requisitos
- Python 3.10+

### Passos
```bash
# Clone o repositório
git clone https://github.com/seu-usuario/quadro-de-pedidos.git
cd quadro-de-pedidos

# Ambiente virtual
python -m venv venv
source venv/bin/activate  # Linux/Mac
# ou
venv\Scripts\activate  # Windows

# Dependências
pip install -r requirements.txt

# Inicie o sistema
python run.py
```

Acesse: **http://localhost:52080**

> O banco de dados é criado automaticamente no primeiro acesso.

## ⚙️ Configuração Inicial

1. Crie o primeiro usuário administrador
2. Atribua permissão: **Administrador de Sistema**

## 🌙 Recursos Adicionais

- **Modo Escuro** - Tema automático com persistência local
- **Modo TV** - Acesso via `/tv-expedicao` (otimizado para monitores)

## 📁 Estrutura do Projeto

```
quadro_app/
├── blueprints/     # Rotas da API
├── static/         # CSS, JS e imagens
├── templates/      # Templates Jinja2
├── models.py       # Modelos do banco
└── extensions.py   # Configurações

run.py              # Inicializador
requirements.txt    # Dependências
quadro_local.db     # SQLite (auto-gerado)
```

Desenvolvido com ❤️ para otimizar processos logísticos.