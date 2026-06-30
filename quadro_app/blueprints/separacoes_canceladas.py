# quadro_app/blueprints/separacoes_canceladas.py
from flask import Blueprint, request, jsonify
from datetime import datetime
from sqlalchemy import or_
from ..extensions import db, tz_cuiaba
from quadro_app.models import SeparacaoCancelada
from quadro_app.utils import registrar_log
from quadro_app import socketio

separacoes_canceladas_bp = Blueprint(
    'separacoes_canceladas', __name__, url_prefix='/api/separacoes-canceladas'
)


def serialize(s):
    return {
        'id': s.id,
        'data': s.data,
        'numero_separacao': s.numero_separacao,
        'nome_cliente': s.nome_cliente,
        'separador_nome': s.separador_nome,
        'criado_por': s.criado_por,
        'data_criacao': s.data_criacao,
    }


@separacoes_canceladas_bp.route('/paginadas', methods=['POST'])
def listar_paginadas():
    dados = request.get_json() or {}
    page = dados.get('page', 0)
    limit = dados.get('limit', 30)
    search = (dados.get('search') or '').lower().strip()

    query = SeparacaoCancelada.query
    if search:
        query = query.filter(or_(
            SeparacaoCancelada.numero_separacao.ilike(f'%{search}%'),
            SeparacaoCancelada.nome_cliente.ilike(f'%{search}%'),
            SeparacaoCancelada.separador_nome.ilike(f'%{search}%'),
        ))

    pagination = query.order_by(SeparacaoCancelada.data.desc(),
                                SeparacaoCancelada.id.desc())\
        .paginate(page=page + 1, per_page=limit, error_out=False)
    return jsonify({
        'registros': [serialize(s) for s in pagination.items],
        'temMais': pagination.has_next,
    })


@separacoes_canceladas_bp.route('', methods=['POST'])
def criar():
    dados = request.get_json() or {}
    editor_nome = dados.get('editor_nome', 'Sistema')
    data = (dados.get('data') or '').strip()
    numero = (dados.get('numero_separacao') or '').strip()
    cliente = (dados.get('nome_cliente') or '').strip()
    separador = (dados.get('separador_nome') or '').strip()

    if not data or not numero or not cliente or not separador:
        return jsonify({'error': 'Preencha data, número, cliente e separador.'}), 400

    novo = SeparacaoCancelada(
        data=data,
        numero_separacao=numero,
        nome_cliente=cliente,
        separador_nome=separador,
        criado_por=editor_nome,
        data_criacao=datetime.now(tz_cuiaba).isoformat(),
    )
    db.session.add(novo)
    db.session.commit()
    registrar_log(novo.id, editor_nome, 'SEPARACAO_CANCELADA_CRIADA',
                  detalhes={'info': f'Mov. {numero} — {cliente}'},
                  log_type='separacoes_canceladas')
    socketio.emit('separacao_cancelada_atualizada', {})
    return jsonify({'status': 'success', 'registro': serialize(novo)}), 201


@separacoes_canceladas_bp.route('/<int:registro_id>', methods=['PUT'])
def editar(registro_id):
    dados = request.get_json() or {}
    editor_nome = dados.get('editor_nome', 'Sistema')
    registro = SeparacaoCancelada.query.get_or_404(registro_id)
    for campo in ('data', 'numero_separacao', 'nome_cliente', 'separador_nome'):
        if campo in dados and dados[campo] is not None:
            setattr(registro, campo, str(dados[campo]).strip())
    db.session.commit()
    registrar_log(registro_id, editor_nome, 'SEPARACAO_CANCELADA_EDITADA',
                  log_type='separacoes_canceladas')
    socketio.emit('separacao_cancelada_atualizada', {})
    return jsonify({'status': 'success', 'registro': serialize(registro)})


@separacoes_canceladas_bp.route('/<int:registro_id>', methods=['DELETE'])
def excluir(registro_id):
    editor_nome = (request.get_json() or {}).get('editor_nome', 'Sistema')
    registro = SeparacaoCancelada.query.get_or_404(registro_id)
    db.session.delete(registro)
    db.session.commit()
    registrar_log(registro_id, editor_nome, 'SEPARACAO_CANCELADA_EXCLUIDA',
                  log_type='separacoes_canceladas')
    socketio.emit('separacao_cancelada_atualizada', {})
    return jsonify({'status': 'success'})
