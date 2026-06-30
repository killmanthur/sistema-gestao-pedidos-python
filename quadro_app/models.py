
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
    # Prioridade do recebimento (gerenciada no Kanban de prioridades).
    # NULL = lançamento legado (importado) — não aparece no Kanban/TV de prioridade.
    # Lançamentos novos nascem como 'A definir'.
    prioridade = db.Column(db.String(30), nullable=True, index=True)
    # Momento em que a prioridade ATUAL foi definida. Usado pela regra de
    # escalonamento automático (após 48h a nota sobe um nível, priorizando as
    # mais antigas). NULL enquanto a prioridade for 'A definir'.
    prioridade_definida_em = db.Column(db.String(100))

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

class RetiradaAntecipada(db.Model):
    """Peça retirada por um separador antes da conferência do estoque.
    O checkbox 'conferido' sinaliza que o item já foi acertado (linha verde)."""
    id = db.Column(db.Integer, primary_key=True)
    data = db.Column(db.String(100), index=True)          # data informada (YYYY-MM-DD)
    codigo = db.Column(db.String(100), index=True)
    marca = db.Column(db.String(100))
    separador_nome = db.Column(db.String(100), index=True)
    quantidade = db.Column(db.Integer, default=1)
    numero_separacao = db.Column(db.String(20), index=True)
    conferido = db.Column(db.Boolean, default=False, nullable=False, index=True)
    conferido_por = db.Column(db.String(100))
    data_criacao = db.Column(db.String(100), index=True)
    criado_por = db.Column(db.String(100))


class SeparacaoCancelada(db.Model):
    """Registro simples (apenas controle) de uma separação que foi cancelada.
    Não tem relação com a tabela Separacao — é um lançamento manual em estilo
    planilha (data, número, cliente e separador)."""
    __tablename__ = 'separacao_cancelada'
    id = db.Column(db.Integer, primary_key=True)
    data = db.Column(db.String(20), index=True)          # data informada (YYYY-MM-DD)
    numero_separacao = db.Column(db.String(20), index=True)
    nome_cliente = db.Column(db.String(200), index=True)
    separador_nome = db.Column(db.String(100), index=True)
    criado_por = db.Column(db.String(100))
    data_criacao = db.Column(db.String(100), index=True)


class Notificacao(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(100), db.ForeignKey('usuario.id'), nullable=False)
    mensagem = db.Column(db.String(255), nullable=False)
    link = db.Column(db.String(255))
    lida = db.Column(db.Boolean, default=False, nullable=False)
    timestamp = db.Column(db.String(100), nullable=False)

    usuario = db.relationship('Usuario', backref=db.backref('notificacoes', lazy=True))

campanha_ajustadores = db.Table(
    'campanha_ajustadores',
    db.Column('campanha_id', db.Integer, db.ForeignKey('campanha_ajuste.id', ondelete='CASCADE'), primary_key=True),
    db.Column('usuario_id', db.String(100), db.ForeignKey('usuario.id', ondelete='CASCADE'), primary_key=True),
)


class CampanhaAjuste(db.Model):
    __tablename__ = 'campanha_ajuste'
    id = db.Column(db.Integer, primary_key=True)
    nome = db.Column(db.String(120), nullable=False, index=True)
    # 'Ativa' | 'Finalizada'
    status = db.Column(db.String(20), default='Ativa', nullable=False, index=True)
    observacao = db.Column(db.String(500))

    criado_por = db.Column(db.String(100), nullable=False)
    criado_por_id = db.Column(db.String(100), nullable=False)
    data_inicio = db.Column(db.String(50), nullable=False, index=True)
    data_fim = db.Column(db.String(50))
    finalizado_por = db.Column(db.String(100))
    finalizado_por_id = db.Column(db.String(100))

    ajustadores = db.relationship('Usuario', secondary=campanha_ajustadores, lazy='joined')
    ajustes = db.relationship('AjusteEstoque', backref='campanha', lazy='dynamic')


class AjusteEstoque(db.Model):
    __tablename__ = 'ajuste_estoque'
    id = db.Column(db.Integer, primary_key=True)

    campanha_id = db.Column(db.Integer, db.ForeignKey('campanha_ajuste.id'), nullable=True, index=True)

    # Dados da peça
    codigo = db.Column(db.String(100), nullable=False, index=True)
    marca = db.Column(db.String(100), nullable=False)
    descricao = db.Column(db.String(255))
    quantidade_sistema = db.Column(db.Integer)
    quantidade_real = db.Column(db.Integer, nullable=False)

    # Status: 'Pendente' | 'Ajustado' | 'Cancelado'
    status = db.Column(db.String(20), default='Pendente', nullable=False, index=True)

    # Auditoria - RASTREABILIDADE OBRIGATORIA
    # Nunca apagar/alterar estes campos: se um ajuste der errado, e aqui que
    # identificamos quem contou.
    criado_por = db.Column(db.String(100), nullable=False)
    criado_por_id = db.Column(db.String(100), nullable=False, index=True)
    criado_por_role = db.Column(db.String(50))
    data_criacao = db.Column(db.String(50), nullable=False, index=True)
    aprovado_por = db.Column(db.String(100))
    aprovado_por_id = db.Column(db.String(100))
    data_aprovacao = db.Column(db.String(50))
    observacao_gerente = db.Column(db.String(500))

    # Foto (caminho relativo a static/)
    foto_path = db.Column(db.String(255))
    foto_cadastrada_no_erp = db.Column(db.Boolean, default=False, index=True)
    foto_cadastrada_em = db.Column(db.String(50))
    foto_cadastrada_por = db.Column(db.String(100))


class AnotacaoColuna(db.Model):
    """Coluna de um quadro Kanban de anotações (compartilhado pela equipe)."""
    __tablename__ = 'anotacao_coluna'
    id = db.Column(db.Integer, primary_key=True)
    nome = db.Column(db.String(120), nullable=False)
    cor = db.Column(db.String(20), default='#6366f1')   # cor do cabeçalho da coluna
    ordem = db.Column(db.Integer, default=0, index=True)

    cards = db.relationship(
        'AnotacaoCard',
        backref='coluna',
        cascade='all, delete-orphan',
        order_by='AnotacaoCard.ordem',
        lazy='joined',
    )


class AnotacaoCard(db.Model):
    """Card (anotação) que pertence a uma coluna do Kanban."""
    __tablename__ = 'anotacao_card'
    id = db.Column(db.Integer, primary_key=True)
    coluna_id = db.Column(
        db.Integer,
        db.ForeignKey('anotacao_coluna.id', ondelete='CASCADE'),
        nullable=False,
        index=True,
    )
    titulo = db.Column(db.String(200))
    conteudo = db.Column(db.Text)
    cor = db.Column(db.String(20))           # cor opcional do card (sobrescreve padrão)
    ordem = db.Column(db.Integer, default=0, index=True)
    criado_por = db.Column(db.String(100))
    data_criacao = db.Column(db.String(100))


class RegistroCompra(db.Model):
    id = db.Column(db.Integer, primary_key=True, index=True)
    fornecedor = db.Column(db.String(200), nullable=False, index=True)
    comprador_nome = db.Column(db.String(100), nullable=True, index=True)
    observacao = db.Column(db.Text, index=True)
    status = db.Column(db.String(50), default='Aguardando', index=True) # Pedido, Em Cotação, Aguardando
    data_criacao = db.Column(db.String(100), nullable=False, index=True)
    editor_nome = db.Column(db.String(100), index=True)


class Garantia(db.Model):
    """Processo de garantia de uma peça junto ao fornecedor.

    Recebe atualizações constantes (linha do tempo de 'acompanhamento') enquanto
    está com status 'Pendente'. Ao mudar para qualquer outro status
    ('Recusada', 'Concedida', 'Abandono') o processo é considerado finalizado e
    passa a aparecer na aba de Finalizadas. Pode retornar para 'Pendente' caso
    volte a ser trabalhado."""
    __tablename__ = 'garantia'
    id = db.Column(db.Integer, primary_key=True)

    # Dados do processo
    nome_cliente = db.Column(db.String(200), index=True)
    descricao_peca = db.Column(db.Text)
    codigo_peca = db.Column(db.String(100), index=True)
    marca = db.Column(db.String(100))
    fornecedor = db.Column(db.String(200), index=True)
    defeito = db.Column(db.Text)
    quantidade = db.Column(db.Integer, default=1)

    # Datas (texto YYYY-MM-DD, como o restante do sistema)
    data_inicio = db.Column(db.String(20), index=True)
    data_envio_fornecedor = db.Column(db.String(20))
    ultimo_contato = db.Column(db.String(20))
    data_final = db.Column(db.String(20))        # preenchida ao finalizar

    # Linha do tempo de acompanhamento: lista de {texto, autor, timestamp}.
    # Recebe edições constantes ("em contato com fornecedor dia 30/06...").
    acompanhamento = db.Column(MutableList.as_mutable(JSON), default=[])
    conclusao = db.Column(db.Text)               # desfecho/observação final

    # 'Pendente' | 'Recusada' | 'Concedida' | 'Abandono'
    status = db.Column(db.String(20), default='Pendente', nullable=False, index=True)

    # Auditoria
    criado_por = db.Column(db.String(100))
    data_criacao = db.Column(db.String(100), index=True)
    atualizado_em = db.Column(db.String(100))
    finalizado_por = db.Column(db.String(100))
    finalizado_em = db.Column(db.String(100))


class MovimentacaoCompra(db.Model):
    """
    Registro de auditoria das transições de status de um RegistroCompra.

    Cada mudança de status (incluindo a criação) gera um evento aqui.
    Um registro só é considerado "auditável" se possui um evento de criação
    (status_anterior = NULL). Registros criados antes deste módulo não têm
    eventos e portanto são ignorados nas estatísticas de auditoria.
    """
    __tablename__ = 'movimentacao_compra'
    id = db.Column(db.Integer, primary_key=True)
    registro_id = db.Column(
        db.Integer,
        db.ForeignKey('registro_compra.id', ondelete='CASCADE'),
        nullable=False,
        index=True,
    )
    # status_anterior = NULL marca o evento de criação do registro.
    status_anterior = db.Column(db.String(50))
    status_novo = db.Column(db.String(50), nullable=False)
    timestamp = db.Column(db.String(50), nullable=False, index=True)
    autor = db.Column(db.String(100))

    registro = db.relationship('RegistroCompra', backref=db.backref('movimentacoes', lazy='dynamic'))