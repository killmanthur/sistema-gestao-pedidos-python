# quadro_app/blueprints/retiradas.py
from flask import Blueprint, request, jsonify, session
from datetime import datetime
from ..extensions import db, tz_cuiaba
from quadro_app.models import RetiradaAntecipada, Usuario
from quadro_app import socketio

retiradas_bp = Blueprint('retiradas', __name__, url_prefix='/api/retiradas')

PAGE_KEY = 'retiradas_antecipadas'      # base: ver a aba e preencher
CONFERIR_KEY = 'retiradas_conferir'     # extra: marcar/desmarcar o checkbox


def _usuario_atual():
    uid = session.get('user_id')
    if not uid:
        return None
    return Usuario.query.get(uid)


def _pode_ver(u):
    """Acesso base: ver a aba e preencher o formulario."""
    if not u:
        return False
    return u.role == 'Admin' or (u.accessible_pages and PAGE_KEY in u.accessible_pages)


def _pode_conferir(u):
    """Permissao extra: marcar/desmarcar o checkbox de conferido."""
    if not u:
        return False
    return u.role == 'Admin' or (u.accessible_pages and CONFERIR_KEY in u.accessible_pages)


def serialize(r):
    return {
        'id': r.id,
        'data': r.data,
        'codigo': r.codigo,
        'marca': r.marca,
        'separador_nome': r.separador_nome,
        'quantidade': r.quantidade,
        'numero_separacao': r.numero_separacao,
        'conferido': bool(r.conferido),
        'conferido_por': r.conferido_por,
        'data_criacao': r.data_criacao,
        'criado_por': r.criado_por,
    }


@retiradas_bp.route('', methods=['GET'])
def listar():
    u = _usuario_atual()
    if not _pode_ver(u):
        return jsonify({'error': 'Acesso restrito.'}), 403
    registros = RetiradaAntecipada.query.order_by(RetiradaAntecipada.id.desc()).all()
    # Informa ao frontend se o usuario pode marcar o checkbox.
    return jsonify({
        'registros': [serialize(r) for r in registros],
        'pode_conferir': _pode_conferir(u),
    })


@retiradas_bp.route('', methods=['POST'])
def criar():
    u = _usuario_atual()
    if not _pode_ver(u):
        return jsonify({'error': 'Acesso restrito.'}), 403

    dados = request.get_json() or {}
    codigo = (dados.get('codigo') or '').strip()
    separador = (dados.get('separador_nome') or '').strip()
    if not codigo or not separador:
        return jsonify({'error': 'Código e separador são obrigatórios.'}), 400

    try:
        quantidade = int(dados.get('quantidade') or 1)
    except (TypeError, ValueError):
        quantidade = 1

    nova = RetiradaAntecipada(
        data=(dados.get('data') or '').strip() or datetime.now(tz_cuiaba).strftime('%Y-%m-%d'),
        codigo=codigo,
        marca=(dados.get('marca') or '').strip(),
        separador_nome=separador,
        quantidade=quantidade,
        numero_separacao=(dados.get('numero_separacao') or '').strip(),
        conferido=False,
        data_criacao=datetime.now(tz_cuiaba).isoformat(),
        criado_por=u.nome if u else 'Sistema',
    )
    db.session.add(nova)
    db.session.commit()
    socketio.emit('retiradas_atualizado')
    return jsonify({'status': 'success', 'registro': serialize(nova)}), 201


@retiradas_bp.route('/<int:retirada_id>/conferido', methods=['PUT'])
def alternar_conferido(retirada_id):
    u = _usuario_atual()
    if not _pode_ver(u):
        return jsonify({'error': 'Acesso restrito.'}), 403
    if not _pode_conferir(u):
        return jsonify({'error': 'Você não tem permissão para conferir itens.'}), 403

    reg = RetiradaAntecipada.query.get_or_404(retirada_id)
    dados = request.get_json() or {}
    # Aceita valor explicito; senao alterna.
    novo = dados.get('conferido')
    reg.conferido = (not reg.conferido) if novo is None else bool(novo)
    reg.conferido_por = u.nome if reg.conferido else None
    db.session.commit()
    socketio.emit('retiradas_atualizado')
    return jsonify({'status': 'success', 'registro': serialize(reg)})


@retiradas_bp.route('/<int:retirada_id>', methods=['PUT'])
def editar(retirada_id):
    u = _usuario_atual()
    # Editar e liberado para quem pode ver/preencher (nao exige conferir).
    if not _pode_ver(u):
        return jsonify({'error': 'Acesso restrito.'}), 403

    reg = RetiradaAntecipada.query.get_or_404(retirada_id)
    dados = request.get_json() or {}

    codigo = (dados.get('codigo') or '').strip()
    separador = (dados.get('separador_nome') or '').strip()
    if not codigo or not separador:
        return jsonify({'error': 'Código e separador são obrigatórios.'}), 400
    try:
        quantidade = int(dados.get('quantidade') or 1)
    except (TypeError, ValueError):
        quantidade = 1

    reg.data = (dados.get('data') or '').strip() or reg.data
    reg.codigo = codigo
    reg.marca = (dados.get('marca') or '').strip()
    reg.separador_nome = separador
    reg.quantidade = quantidade
    reg.numero_separacao = (dados.get('numero_separacao') or '').strip()
    db.session.commit()
    socketio.emit('retiradas_atualizado')
    return jsonify({'status': 'success', 'registro': serialize(reg)})


@retiradas_bp.route('/<int:retirada_id>', methods=['DELETE'])
def excluir(retirada_id):
    u = _usuario_atual()
    if not _pode_ver(u):
        return jsonify({'error': 'Acesso restrito.'}), 403
    # Excluir tambem e restrito a quem pode conferir (+ Admin).
    if not _pode_conferir(u):
        return jsonify({'error': 'Você não tem permissão para excluir retiradas.'}), 403
    reg = RetiradaAntecipada.query.get_or_404(retirada_id)
    db.session.delete(reg)
    db.session.commit()
    socketio.emit('retiradas_atualizado')
    return jsonify({'status': 'success'})
