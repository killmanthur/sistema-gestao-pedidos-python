# sistema-gestao-pedidos-python

Sistema de desktop para gestão de pedidos e separações. Desenvolvido com Python, Flask, Firebase (Realtime Database) e com interface renderizada via PyWebView.

## Funcionalidades

- Criação de pedidos de rua e orçamentos.
- Quadro de visualização em tempo real (Kanban).
- Sistema de sugestão de compras.
- Módulo de controle de separações de estoque com fila de prioridade.
- Autenticação e sistema de permissões por função de usuário.

## Como Executar

1. Clone o repositório.
2. Crie um ambiente virtual: `python -m venv venv`
3. Ative o ambiente virtual: `venv\Scripts\activate`
4. Instale as dependências: `pip install -r requirements.txt`
5. Adicione seu arquivo `serviceAccountKey.json` do Firebase na raiz do projeto.
6. Execute o programa: `python run.py`