# quadro_app/blueprints/anotacoes.py
from flask import Blueprint, request, jsonify, session
from datetime import datetime
from ..extensions import db, tz_cuiaba
from quadro_app.models import AnotacaoColuna, AnotacaoCard, Usuario
from quadro_app import socketio

anotacoes_bp = Blueprint('anotacoes', __name__, url_prefix='/api/anotacoes')

PAGE_KEY = 'anotacoes'
COR_PADRAO = '#6366f1'


def _usuario_atual():
    uid = session.get('user_id')
    if not uid:
        return None
    return Usuario.query.get(uid)


def _pode_ver(u):
    if not u:
        return False
    return u.role == 'Admin' or (u.accessible_pages and PAGE_KEY in u.accessible_pages)


def serialize_card(c):
    return {
        'id': c.id,
        'coluna_id': c.coluna_id,
        'titulo': c.titulo or '',
        'conteudo': c.conteudo or '',
        'cor': c.cor,
        'ordem': c.ordem,
        'criado_por': c.criado_por,
        'data_criacao': c.data_criacao,
    }


def serialize_coluna(col):
    cards = sorted(col.cards, key=lambda c: (c.ordem, c.id))
    return {
        'id': col.id,
        'nome': col.nome,
        'cor': col.cor or COR_PADRAO,
        'ordem': col.ordem,
        'cards': [serialize_card(c) for c in cards],
    }


def _emitir():
    socketio.emit('anotacoes_atualizado')


# --- QUADRO COMPLETO ---
@anotacoes_bp.route('', methods=['GET'])
def listar():
    u = _usuario_atual()
    if not _pode_ver(u):
        return jsonify({'error': 'Acesso restrito.'}), 403
    colunas = AnotacaoColuna.query.order_by(AnotacaoColuna.ordem, AnotacaoColuna.id).all()
    return jsonify({'colunas': [serialize_coluna(c) for c in colunas]})


# --- COLUNAS ---
@anotacoes_bp.route('/colunas', methods=['POST'])
def criar_coluna():
    u = _usuario_atual()
    if not _pode_ver(u):
        return jsonify({'error': 'Acesso restrito.'}), 403
    dados = request.get_json() or {}
    nome = (dados.get('nome') or '').strip()
    if not nome:
        return jsonify({'error': 'Nome da coluna é obrigatório.'}), 400
    cor = (dados.get('cor') or COR_PADRAO).strip()
    ultima = AnotacaoColuna.query.order_by(AnotacaoColuna.ordem.desc()).first()
    nova = AnotacaoColuna(nome=nome, cor=cor, ordem=(ultima.ordem + 1) if ultima else 0)
    db.session.add(nova)
    db.session.commit()
    _emitir()
    return jsonify({'status': 'success', 'coluna': serialize_coluna(nova)}), 201


@anotacoes_bp.route('/colunas/<int:coluna_id>', methods=['PUT'])
def editar_coluna(coluna_id):
    u = _usuario_atual()
    if not _pode_ver(u):
        return jsonify({'error': 'Acesso restrito.'}), 403
    col = AnotacaoColuna.query.get_or_404(coluna_id)
    dados = request.get_json() or {}
    if 'nome' in dados:
        nome = (dados.get('nome') or '').strip()
        if not nome:
            return jsonify({'error': 'Nome da coluna é obrigatório.'}), 400
        col.nome = nome
    if 'cor' in dados:
        col.cor = (dados.get('cor') or COR_PADRAO).strip()
    db.session.commit()
    _emitir()
    return jsonify({'status': 'success', 'coluna': serialize_coluna(col)})


@anotacoes_bp.route('/colunas/<int:coluna_id>', methods=['DELETE'])
def excluir_coluna(coluna_id):
    u = _usuario_atual()
    if not _pode_ver(u):
        return jsonify({'error': 'Acesso restrito.'}), 403
    col = AnotacaoColuna.query.get_or_404(coluna_id)
    db.session.delete(col)   # cascade remove os cards
    db.session.commit()
    _emitir()
    return jsonify({'status': 'success'})


@anotacoes_bp.route('/colunas/ordem', methods=['PUT'])
def reordenar_colunas():
    """Recebe {ordem: [id1, id2, ...]} e aplica a nova ordem das colunas."""
    u = _usuario_atual()
    if not _pode_ver(u):
        return jsonify({'error': 'Acesso restrito.'}), 403
    dados = request.get_json() or {}
    ids = dados.get('ordem') or []
    for indice, cid in enumerate(ids):
        col = AnotacaoColuna.query.get(cid)
        if col:
            col.ordem = indice
    db.session.commit()
    _emitir()
    return jsonify({'status': 'success'})


# --- CARDS ---
@anotacoes_bp.route('/cards', methods=['POST'])
def criar_card():
    u = _usuario_atual()
    if not _pode_ver(u):
        return jsonify({'error': 'Acesso restrito.'}), 403
    dados = request.get_json() or {}
    coluna_id = dados.get('coluna_id')
    col = AnotacaoColuna.query.get(coluna_id)
    if not col:
        return jsonify({'error': 'Coluna não encontrada.'}), 404
    titulo = (dados.get('titulo') or '').strip()
    conteudo = (dados.get('conteudo') or '').strip()
    if not titulo and not conteudo:
        return jsonify({'error': 'Informe um título ou conteúdo.'}), 400
    ultimo = (AnotacaoCard.query.filter_by(coluna_id=col.id)
              .order_by(AnotacaoCard.ordem.desc()).first())
    novo = AnotacaoCard(
        coluna_id=col.id,
        titulo=titulo,
        conteudo=conteudo,
        cor=(dados.get('cor') or None),
        ordem=(ultimo.ordem + 1) if ultimo else 0,
        criado_por=u.nome if u else 'Sistema',
        data_criacao=datetime.now(tz_cuiaba).isoformat(),
    )
    db.session.add(novo)
    db.session.commit()
    _emitir()
    return jsonify({'status': 'success', 'card': serialize_card(novo)}), 201


@anotacoes_bp.route('/cards/<int:card_id>', methods=['PUT'])
def editar_card(card_id):
    u = _usuario_atual()
    if not _pode_ver(u):
        return jsonify({'error': 'Acesso restrito.'}), 403
    card = AnotacaoCard.query.get_or_404(card_id)
    dados = request.get_json() or {}
    if 'titulo' in dados:
        card.titulo = (dados.get('titulo') or '').strip()
    if 'conteudo' in dados:
        card.conteudo = (dados.get('conteudo') or '').strip()
    if 'cor' in dados:
        card.cor = (dados.get('cor') or None)
    if not (card.titulo or card.conteudo):
        return jsonify({'error': 'Informe um título ou conteúdo.'}), 400
    db.session.commit()
    _emitir()
    return jsonify({'status': 'success', 'card': serialize_card(card)})


@anotacoes_bp.route('/cards/<int:card_id>', methods=['DELETE'])
def excluir_card(card_id):
    u = _usuario_atual()
    if not _pode_ver(u):
        return jsonify({'error': 'Acesso restrito.'}), 403
    card = AnotacaoCard.query.get_or_404(card_id)
    db.session.delete(card)
    db.session.commit()
    _emitir()
    return jsonify({'status': 'success'})


@anotacoes_bp.route('/cards/mover', methods=['PUT'])
def mover_card():
    """Move um card para uma coluna e reordena os cards dessa coluna.
    Body: {card_id, coluna_id, ordem: [card_ids na ordem final da coluna destino]}.
    """
    u = _usuario_atual()
    if not _pode_ver(u):
        return jsonify({'error': 'Acesso restrito.'}), 403
    dados = request.get_json() or {}
    card = AnotacaoCard.query.get_or_404(dados.get('card_id'))
    col = AnotacaoColuna.query.get(dados.get('coluna_id'))
    if not col:
        return jsonify({'error': 'Coluna não encontrada.'}), 404

    card.coluna_id = col.id
    # Reindexa os cards da coluna destino conforme a ordem recebida.
    ids = dados.get('ordem') or [card.id]
    for indice, cid in enumerate(ids):
        c = AnotacaoCard.query.get(cid)
        if c and c.coluna_id == col.id:
            c.ordem = indice
    db.session.commit()
    _emitir()
    return jsonify({'status': 'success'})
