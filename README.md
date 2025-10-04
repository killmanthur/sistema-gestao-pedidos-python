# sistema-gestao-pedidos-python

Sistema de desktop para gestão de pedidos e separações. Desenvolvido com Python, Flask, Firebase (Realtime Database) e com interface renderizada via PyWebView.

## Funcionalidades

- **Gestão de Compras:**
  - Criação de pedidos de rua e orçamentos.
  - Quadro de visualização em tempo real (Kanban) para acompanhamento dos compradores.
  - Sistema de sugestão de compras com fluxo de aprovação.

- **Módulo de Recebimento e Conferência de Mercadorias:**
  - Registro de entrada de notas fiscais, com um fluxo otimizado para compras locais ("Notas da Rua") sem transportadora.
  - Atribuição de conferentes e acompanhamento do status da conferência em tempo real.
  - Gestão de pendências para itens com avaria ou divergência.

- **Controle de Estoque e Separação:**
  - Módulo de controle de separações com fila de prioridade para distribuição de tarefas.
  - Acompanhamento do status de separação em um quadro Kanban (Andamento, Conferência, Finalizado).

- **Administração e Análise:**
  - Autenticação e sistema de permissões granular por função de usuário.
  - Dashboard com gráficos para análise de produtividade e volume de pedidos.
  - Histórico de pedidos com filtros avançados e geração de relatórios.

## Como Executar

1. Clone o repositório.
2. Crie um ambiente virtual: `python -m venv venv`
3. Ative o ambiente virtual: `venv\Scripts\activate`
4. Instale as dependências: `pip install -r requirements.txt`
5. Adicione seu arquivo `serviceAccountKey.json` do Firebase na raiz do projeto.
6. Execute o programa: `python run.py`