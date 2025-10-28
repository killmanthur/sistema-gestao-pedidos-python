# quadro_app/models.py
from . import db
from datetime import datetime
from sqlalchemy.ext.mutable import MutableList
from sqlalchemy.types import JSON

# --- MODELOS PRINCIPAIS ---

class Pedido(db.Model):
    # ... (sem alterações aqui)
    id = db.Column(db.Integer, primary_key=True)
    vendedor = db.Column(db.String(100))
    status = db.Column(db.String(50), default='Aguardando')
    tipo_req = db.Column(db.String(50))
    comprador = db.Column(db.String(100))
    data_criacao = db.Column(db.String(100))
    data_finalizacao = db.Column(db.String(100))
    observacao_geral = db.Column(db.Text)
    itens = db.Column(MutableList.as_mutable(JSON))
    codigo = db.Column(db.String(100))
    descricao = db.Column(db.Text)
    marca = db.Column(db.String(100))

class Sugestao(db.Model):
    # ... (sem alterações aqui)
    id = db.Column(db.Integer, primary_key=True)
    vendedor = db.Column(db.String(100))
    status = db.Column(db.String(50), default='pendente')
    comprador = db.Column(db.String(100))
    data_criacao = db.Column(db.String(100))
    itens = db.Column(MutableList.as_mutable(JSON))
    observacao_geral = db.Column(db.Text)
    codigo = db.Column(db.String(100), nullable=True)
    descricao = db.Column(db.Text, nullable=True)
    marca = db.Column(db.String(100), nullable=True)
    quantidade = db.Column(db.Integer, nullable=True)

class Separacao(db.Model):
    # ... (sem alterações aqui)
    id = db.Column(db.Integer, primary_key=True)
    numero_movimentacao = db.Column(db.String(20), unique=True, nullable=False)
    nome_cliente = db.Column(db.String(200))
    separador_nome = db.Column(db.String(100))
    vendedor_nome = db.Column(db.String(100))
    status = db.Column(db.String(50), default='Em Separação')
    data_criacao = db.Column(db.String(100))
    data_inicio_conferencia = db.Column(db.String(100))
    data_finalizacao = db.Column(db.String(100))
    conferente_nome = db.Column(db.String(100))
    observacoes = db.Column(MutableList.as_mutable(JSON))
    qtd_pecas = db.Column(db.Integer, default=0)

class Conferencia(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    data_recebimento = db.Column(db.String(100))
    numero_nota_fiscal = db.Column(db.String(100))
    nome_fornecedor = db.Column(db.String(200))
    nome_transportadora = db.Column(db.String(100))
    qtd_volumes = db.Column(db.Integer)
    vendedor_nome = db.Column(db.String(100))
    recebido_por = db.Column(db.String(100))
    # MUDANÇA: Status mais detalhados
    status = db.Column(db.String(50)) # 'Aguardando...', 'Em Conferência', 'Pendente (Fornecedor)', 'Pendente (Alteração)', 'Pendente (Ambos)', 'Finalizado'
    data_inicio_conferencia = db.Column(db.String(100))
    data_finalizacao = db.Column(db.String(100))
    conferentes = db.Column(MutableList.as_mutable(JSON))
    observacoes = db.Column(MutableList.as_mutable(JSON))
    # MUDANÇA: Campos de controle de resolução reintroduzidos
    resolvido_gestor = db.Column(db.Boolean, default=False)
    resolvido_contabilidade = db.Column(db.Boolean, default=False)
    conferente_nome = db.Column(db.String(100))
    editor_nome = db.Column(db.String(100))

# --- MODELOS DE SUPORTE ---
# ... (Usuario, Log, Notificacao sem alterações)
class Usuario(db.Model):
    id = db.Column(db.String(100), primary_key=True)
    email = db.Column(db.String(150), unique=True, nullable=False)
    nome = db.Column(db.String(150))
    role = db.Column(db.String(50))
    accessible_pages = db.Column(MutableList.as_mutable(JSON))
    permissions = db.Column(db.JSON)
    password_hash = db.Column(db.String(256))
    ativo_na_fila = db.Column(db.Boolean, default=False)
    prioridade_fila = db.Column(db.Integer, default=0)

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