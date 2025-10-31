# quadro_app/blueprints/logs.py
from flask import Blueprint, jsonify
from quadro_app.models import Log

logs_bp = Blueprint('logs', __name__, url_prefix='/api/logs')

def serialize_log(log_entry):
    """Converte um objeto Log do SQLAlchemy para um dicionário JSON."""
    return {
        'id': log_entry.id,
        'autor': log_entry.autor,
        'acao': log_entry.acao,
        'detalhes': log_entry.detalhes,
        'timestamp': log_entry.timestamp
    }

@logs_bp.route('/<string:log_type>/<string:item_id>', methods=['GET'])
def get_logs_for_item(log_type, item_id):
    """
    Busca todos os logs para um item específico, ordenados do mais recente para o mais antigo.
    Ex: /api/logs/pedidos/123
    """
    try:
        logs = Log.query.filter_by(log_type=log_type, item_id=str(item_id))\
                        .order_by(Log.timestamp.desc())\
                        .all()
        
        if not logs:
            return jsonify([]) # Retorna uma lista vazia se não houver logs
            
        return jsonify([serialize_log(log) for log in logs])
    except Exception as e:
        print(f"ERRO ao buscar logs para {log_type}/{item_id}: {e}")
        return jsonify({'error': str(e)}), 500