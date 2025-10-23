# quadro_app/blueprints/notificacoes.py
from flask import Blueprint, request, jsonify
from quadro_app import db
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
    # Em um sistema real com autenticação, você pegaria o user_id da sessão/token.
    # Por enquanto, estamos passando via URL para funcionar.
    
    # Busca as últimas 20 notificações não lidas para este usuário
    notifs = Notificacao.query.filter_by(user_id=user_id)\
                              .order_by(Notificacao.timestamp.desc())\
                              .limit(20).all()
    
    return jsonify([serialize_notificacao(n) for n in notifs])

# Rota para marcar notificações como lidas
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