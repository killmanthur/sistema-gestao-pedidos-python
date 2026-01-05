# quadro_app/blueprints/notificacoes.py
from flask import Blueprint, request, jsonify
from ..extensions import db
from quadro_app.models import Notificacao, Usuario

notificacoes_bp = Blueprint('notificacoes', __name__, url_prefix='/api/notificacoes')

def serialize_notificacao(n):
    return {
        'id': n.id,
        'mensagem': n.mensagem,
        'link': n.link,
        'lida': n.lida,
        'timestamp': n.timestamp
    }

# Rota para buscar notificações de um usuário
@notificacoes_bp.route('/<string:user_id>', methods=['GET'])
def get_notificacoes(user_id):
    # Busca as últimas 20 notificações para este usuário (lidas ou não)
    # para popular o painel.
    notifs = Notificacao.query.filter_by(user_id=user_id)\
                              .order_by(Notificacao.timestamp.desc())\
                              .limit(20).all()
    
    return jsonify([serialize_notificacao(n) for n in notifs])

# Rota para marcar notificações como lidas (ao abrir o painel)
@notificacoes_bp.route('/<string:user_id>/mark-as-read', methods=['POST'])
def mark_as_read(user_id):
    try:
        # Marca todas as notificações não lidas do usuário como lidas
        Notificacao.query.filter_by(user_id=user_id, lida=False).update({'lida': True})
        db.session.commit()
        return jsonify({'status': 'success'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@notificacoes_bp.route('/<string:user_id>/clear-all', methods=['DELETE'])
def clear_all(user_id):
    try:
        # Exclui todas as notificações do banco de dados para esse usuário
        Notificacao.query.filter_by(user_id=user_id).delete()
        db.session.commit()
        return jsonify({'status': 'success'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500