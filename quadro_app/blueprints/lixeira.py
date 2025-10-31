# quadro_app/blueprints/lixeira.py
from flask import Blueprint, request, jsonify
from ..extensions import db
from quadro_app.models import ItemExcluido, Pedido, Sugestao, Separacao, Conferencia
from quadro_app.utils import registrar_log

lixeira_bp = Blueprint('lixeira', __name__, url_prefix='/api/lixeira')

def serialize_item_excluido(item):
    return {
        'id': item.id,
        'tipo_item': item.tipo_item,
        'item_id_original': item.item_id_original,
        'dados_item': item.dados_item,
        'excluido_por': item.excluido_por,
        'data_exclusao': item.data_exclusao
    }

MODEL_MAP = {
    'Pedido': Pedido,
    'Sugestao': Sugestao,
    'Separacao': Separacao,
    'Conferencia': Conferencia
}

@lixeira_bp.route('', methods=['GET'])
def get_itens_excluidos():
    try:
        itens = ItemExcluido.query.order_by(ItemExcluido.data_exclusao.desc()).all()
        return jsonify([serialize_item_excluido(item) for item in itens])
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@lixeira_bp.route('/restaurar/<int:item_id>', methods=['POST'])
def restaurar_item(item_id):
    editor_nome = request.json.get('editor_nome', 'Sistema')
    item_lixeira = ItemExcluido.query.get_or_404(item_id)

    tipo_item = item_lixeira.tipo_item
    dados_item = item_lixeira.dados_item

    # Encontra a classe do modelo correspondente
    model_class = MODEL_MAP.get(tipo_item)
    if not model_class:
        return jsonify({'error': f'Tipo de item desconhecido: {tipo_item}'}), 400
    
    # Verifica se um item com o ID original já existe (caso raro)
    if db.session.get(model_class, dados_item['id']):
         return jsonify({'error': f'Um item do tipo {tipo_item} com o ID {dados_item["id"]} já existe. Restauração cancelada.'}), 409

    try:
        # Recria o item na tabela original
        # **Importante**: Removemos o 'id' para que o SQLAlchemy não tente inseri-lo explicitamente
        # se o ID for auto-incrementado.
        dados_item.pop('id', None)
        item_restaurado = model_class(**dados_item)
        db.session.add(item_restaurado)
        
        # Remove da lixeira
        db.session.delete(item_lixeira)
        
        db.session.commit()

        # Adiciona um log no item restaurado
        registrar_log(item_restaurado.id, editor_nome, 'RESTAURACAO', log_type=tipo_item.lower()+'s')

        return jsonify({'status': 'success', 'message': f'{tipo_item} restaurado com sucesso.'})

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Erro ao restaurar: {str(e)}'}), 500