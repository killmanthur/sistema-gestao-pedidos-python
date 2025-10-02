# quadro_app/blueprints/chats.py
from flask import Blueprint, request, jsonify
import time
from quadro_app import db

chats_bp = Blueprint('chats', __name__, url_prefix='/api/chats')

@chats_bp.route('/<string:pedido_id>/message', methods=['POST'])
def enviar_mensagem_chat(pedido_id):
    dados = request.get_json()
    remetente_uid = dados.get('remetente_uid')
    remetente_nome = dados.get('remetente_nome')
    texto = dados.get('texto')

    if not all([pedido_id, remetente_uid, remetente_nome, texto]):
        return jsonify({'error': 'Dados incompletos'}), 400

    try:
        chat_ref = db.reference(f'chats/{pedido_id}')
        chat_ref.push({
            'remetente': remetente_nome,
            'texto': texto,
            'timestamp': int(time.time() * 1000)
        })

        pedido_ref = db.reference(f'pedidos/{pedido_id}')
        pedido = pedido_ref.get()
        if not pedido:
            return jsonify({'status': 'success', 'message': 'Mensagem enviada, mas pedido não encontrado para notificar.'}), 201

        vendedor_nome = pedido.get('vendedor')
        comprador_nome = pedido.get('comprador')
        
        destinatario_nome = None
        if remetente_nome == vendedor_nome and comprador_nome:
            destinatario_nome = comprador_nome
        elif remetente_nome == comprador_nome and vendedor_nome:
            destinatario_nome = vendedor_nome
        
        if destinatario_nome:
            usuarios_ref = db.reference('usuarios')
            todos_usuarios = usuarios_ref.order_by_child('nome').equal_to(destinatario_nome).get()
            if todos_usuarios:
                destinatario_uid = list(todos_usuarios.keys())[0]
                notificacao_ref = db.reference(f'notificacoes/{destinatario_uid}')
                
                codigo_pedido = pedido.get('itens', [{}])[0].get('codigo', pedido.get('codigo', 'N/A'))
                if len(pedido.get('itens', [])) > 1:
                    codigo_pedido += "..."

                notificacao_ref.push({
                    'mensagem': f"{remetente_nome} enviou uma mensagem no pedido '{codigo_pedido}'",
                    'pedidoId': pedido_id,
                    'lida': False,
                    'timestamp': int(time.time() * 1000)
                })

        return jsonify({'status': 'success', 'message': 'Mensagem e notificação enviadas.'}), 201

    except Exception as e:
        return jsonify({'error': str(e)}), 500