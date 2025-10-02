# quadro_app/blueprints/admin.py
from flask import Blueprint, request, jsonify
from quadro_app import db

admin_bp = Blueprint('admin', __name__, url_prefix='/api/config/compradores')

@admin_bp.route('', methods=['GET'])
def get_compradores():
    try:
        ref = db.reference('config/compradores')
        compradores = ref.get()
        if compradores is None:
            initial_compradores = ["Jean", "Rafael", "Gabriel"]
            ref.set(initial_compradores)
            return jsonify(initial_compradores)
        return jsonify(compradores)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@admin_bp.route('', methods=['POST'])
def add_comprador():
    dados = request.get_json()
    novo_comprador = dados.get('nome')
    user_role = dados.get('role')

    # ATENÇÃO: Esta verificação de permissão é INSEGURA como discutido.
    # Deve ser substituída pela verificação de token no backend.
    if user_role != 'Admin':
        return jsonify({'error': 'Apenas administradores podem adicionar compradores.'}), 403
    if not novo_comprador or len(novo_comprador.strip()) < 2:
        return jsonify({'error': 'Nome do comprador inválido.'}), 400

    try:
        ref = db.reference('config/compradores')
        lista_atual = ref.get() or []
        if novo_comprador in lista_atual:
            return jsonify({'error': 'Este comprador já existe.'}), 409
        
        lista_atual.append(novo_comprador)
        ref.set(lista_atual)
        return jsonify({'status': 'success', 'lista': lista_atual}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@admin_bp.route('', methods=['DELETE'])
def remove_comprador():
    dados = request.get_json()
    comprador_a_remover = dados.get('nome')
    user_role = dados.get('role')

    # ATENÇÃO: Esta verificação de permissão é INSEGURA.
    if user_role != 'Admin':
        return jsonify({'error': 'Apenas administradores podem remover compradores.'}), 403
    if not comprador_a_remover:
        return jsonify({'error': 'Nome do comprador não fornecido.'}), 400

    try:
        ref = db.reference('config/compradores')
        lista_atual = ref.get() or []
        if comprador_a_remover not in lista_atual:
            return jsonify({'error': 'Comprador não encontrado.'}), 404
            
        lista_atual.remove(comprador_a_remover)
        ref.set(lista_atual)
        return jsonify({'status': 'success', 'lista': lista_atual})
    except Exception as e:
        return jsonify({'error': str(e)}), 500