
# quadro_app/models.py
from datetime import datetime
from sqlalchemy.ext.mutable import MutableList
from sqlalchemy.types import JSON
from .extensions import db

# --- MODELOS PRINCIPAIS ---

class Pedido(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    vendedor = db.Column(db.String(100), index=True) # <-- ADICIONADO: Índice
    status = db.Column(db.String(50), default='Aguardando', index=True) # <-- ADICIONADO: Índice
    tipo_req = db.Column(db.String(50), index=True) # <-- ADICIONADO: Índice
    comprador = db.Column(db.String(100), index=True) # <-- ADICIONADO: Índice
    data_criacao = db.Column(db.String(100), index=True) # <-- ADICIONADO: Índice
    data_finalizacao = db.Column(db.String(100), index=True) # <-- ADICIONADO: Índice
    observacao_geral = db.Column(db.Text)
    itens = db.Column(MutableList.as_mutable(JSON))
    codigo = db.Column(db.String(100))
    descricao = db.Column(db.Text)
    marca = db.Column(db.String(100))

class Sugestao(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    vendedor = db.Column(db.String(100), index=True) # <-- ADICIONADO: Índice
    status = db.Column(db.String(50), default='pendente', index=True) # <-- ADICIONADO: Índice
    comprador = db.Column(db.String(100), index=True) # <-- ADICIONADO: Índice
    data_criacao = db.Column(db.String(100), index=True) # <-- ADICIONADO: Índice
    itens = db.Column(MutableList.as_mutable(JSON))
    observacao_geral = db.Column(db.Text)
    # ... (outras colunas permanecem iguais)
    codigo = db.Column(db.String(100), nullable=True)
    descricao = db.Column(db.Text, nullable=True)
    marca = db.Column(db.String(100), nullable=True)
    quantidade = db.Column(db.Integer, nullable=True)


class Separacao(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    numero_movimentacao = db.Column(db.String(20), unique=True, nullable=False, index=True) # <-- ADICIONADO: Índice
    nome_cliente = db.Column(db.String(200))
    separadores_nomes = db.Column(MutableList.as_mutable(JSON))
    vendedor_nome = db.Column(db.String(100), index=True) # <-- ADICIONADO: Índice
    status = db.Column(db.String(50), default='Em Separação', index=True) # <-- ADICIONADO: Índice
    data_criacao = db.Column(db.String(100), index=True) # <-- ADICIONADO: Índice
    data_inicio_conferencia = db.Column(db.String(100))
    data_finalizacao = db.Column(db.String(100), index=True) # <-- ADICIONADO: Índice
    conferente_nome = db.Column(db.String(100))
    observacoes = db.Column(MutableList.as_mutable(JSON))
    qtd_pecas = db.Column(db.Integer, default=0)

class Conferencia(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    data_recebimento = db.Column(db.String(100))
    numero_nota_fiscal = db.Column(db.String(100), index=True) # <-- ADICIONADO: Índice
    nome_fornecedor = db.Column(db.String(200), index=True) # <-- ADICIONADO: Índice
    nome_transportadora = db.Column(db.String(100), index=True) # <-- ADICIONADO: Índice
    qtd_volumes = db.Column(db.Integer, index=True) # <-- ADICIONADO: Índice
    vendedor_nome = db.Column(db.String(100), index=True) # <-- ADICIONADO: Índice
    recebido_por = db.Column(db.String(100), index=True) # <-- ADICIONADO: Índice
    status = db.Column(db.String(50), index=True) # <-- ADICIONADO: Índice
    data_inicio_conferencia = db.Column(db.String(100), index=True) # <-- ADICIONADO: Índice
    data_conferencia_finalizada = db.Column(db.String(100), index=True) # <-- ADICIONADO: Índice
    data_finalizacao = db.Column(db.String(100), index=True)
    conferentes = db.Column(MutableList.as_mutable(JSON))
    observacoes = db.Column(MutableList.as_mutable(JSON))
    resolvido_gestor = db.Column(db.Boolean, default=False, index=True) # <-- ADICIONADO: Índice
    resolvido_contabilidade = db.Column(db.Boolean, default=False, index=True) # <-- ADICIONADO: Índice
    conferente_nome = db.Column(db.String(100), index=True) # <-- ADICIONADO: Índice
    editor_nome = db.Column(db.String(100))
    total_itens = db.Column(db.Integer, default=0, index=True) # <-- ADICIONADO: Índice

# --- MODELOS DE SUPORTE ---

class Usuario(db.Model):
    id = db.Column(db.String(100), primary_key=True)
    email = db.Column(db.String(150), unique=True, nullable=False)
    nome = db.Column(db.String(150))
    role = db.Column(db.String(50))
    accessible_pages = db.Column(MutableList.as_mutable(JSON))
    permissions = db.Column(db.JSON)
    password_hash = db.Column(db.String(256))

class ListaDinamica(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    nome = db.Column(db.String(100), unique=True, nullable=False) # ex: 'vendedores', 'marcas'
    itens = db.Column(MutableList.as_mutable(JSON), default=[]) # Lista de strings ['João', 'Maria']

class ItemExcluido(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    tipo_item = db.Column(db.String(50), nullable=False) # 'Pedido', 'Sugestao', 'Separacao', 'Conferencia'
    item_id_original = db.Column(db.String(100), nullable=False)
    dados_item = db.Column(db.JSON, nullable=False) # Armazena um JSON do item original
    excluido_por = db.Column(db.String(100))
    data_exclusao = db.Column(db.String(100), nullable=False)
    
    # Índice para buscas mais rápidas
    __table_args__ = (db.Index('idx_tipo_id_original', 'tipo_item', 'item_id_original'),)

class Log(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    item_id = db.Column(db.String(100), nullable=False)
    log_type = db.Column(db.String(50), nullable=False)
    autor = db.Column(db.String(100))
    acao = db.Column(db.String(100))
    detalhes = db.Column(db.JSON)
    timestamp = db.Column(db.String(100))

class Notificacao(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(100), db.ForeignKey('usuario.id'), nullable=False)
    mensagem = db.Column(db.String(255), nullable=False)
    link = db.Column(db.String(255))
    lida = db.Column(db.Boolean, default=False, nullable=False)
    timestamp = db.Column(db.String(100), nullable=False)

    usuario = db.relationship('Usuario', backref=db.backref('notificacoes', lazy=True))

class RegistroCompra(db.Model):
    id = db.Column(db.Integer, primary_key=True, index=True)
    fornecedor = db.Column(db.String(200), nullable=False, index=True)
    comprador_nome = db.Column(db.String(100), nullable=True, index=True)
    observacao = db.Column(db.Text, index=True)
    status = db.Column(db.String(50), default='Aguardando', index=True) # Pedido, Em Cotação, Aguardando
    data_criacao = db.Column(db.String(100), nullable=False, index=True)
    editor_nome = db.Column(db.String(100), index=True)