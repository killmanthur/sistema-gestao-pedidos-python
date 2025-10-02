# quadro_app/blueprints/pedidos.py
from flask import Blueprint, request, jsonify
from datetime import datetime
from quadro_app import db, tz_cuiaba
from quadro_app.utils import registrar_log, criar_notificacao_edicao

pedidos_bp = Blueprint('pedidos', __name__, url_prefix='/api/pedidos')

@pedidos_bp.route('', methods=['POST'])
def criar_pedido():
    dados = request.get_json()
    if not dados: return jsonify({'error': 'Requisição sem dados'}), 400
    
    now_cuiaba = datetime.now(tz_cuiaba).isoformat()
    
    novo_pedido_data = {
        'vendedor': dados.get('vendedor', 'N/A'),
        'status': 'Aguardando',
        'tipo_req': dados.get('tipo_req', 'Indefinido'),
        'comprador': '',
        'data_criacao': now_cuiaba,
        'data_finalizacao': now_cuiaba
    }
    if dados.get('tipo_req') == 'Pedido Produto':
        novo_pedido_data.update({
            'itens': dados.get('itens', []),
            'observacao_geral': dados.get('observacao_geral', '')
        })
    else:
        novo_pedido_data.update({
            'codigo': dados.get('codigo', 'N/A'),
            'quantidade': dados.get('quantidade', 1),
            'descricao': dados.get('descricao', ''),
            'marca': dados.get('marca', 'N/A'),
        })
    ref = db.reference('pedidos')
    novo_pedido_ref = ref.push(novo_pedido_data)
    autor = dados.get('vendedor', 'N/A')
    # MUDANÇA: Adequação à nova assinatura da função
    registrar_log(novo_pedido_ref.key, autor, 'CRIAÇÃO', detalhes={'tipo': dados.get('tipo_req')})

    return jsonify({'status': 'success'}), 201

@pedidos_bp.route('/<string:pedido_id>', methods=['PUT'])
def editar_pedido(pedido_id):
    dados = request.get_json()
    if not dados: return jsonify({'error': 'Requisição sem dados'}), 400
    
    editor_nome = dados.pop('editor_nome', None)

    try:
        ref = db.reference(f'pedidos/{pedido_id}')
        pedido_antigo = ref.get()
        if not pedido_antigo: return jsonify({'error': 'Pedido não encontrado'}), 404

        ref.update(dados)
        
        if editor_nome:
            itens_antigos = pedido_antigo.get('itens', [])
            itens_novos = dados.get('itens', [])
            mapa_antigo = { (item['codigo'], str(item.get('quantidade', '1'))) : item for item in itens_antigos }
            mapa_novo = { (item['codigo'], str(item.get('quantidade', '1'))) : item for item in itens_novos }
            itens_adicionados = [item for chave, item in mapa_novo.items() if chave not in mapa_antigo]
            itens_removidos = [item for chave, item in mapa_antigo.items() if chave not in mapa_novo]
            
            detalhes_log = {}
            if itens_adicionados: detalhes_log['adicionado'] = [f"{item['quantidade']}x {item['codigo']}" for item in itens_adicionados]
            if itens_removidos: detalhes_log['removido'] = [f"{item['quantidade']}x {item['codigo']}" for item in itens_removidos]
            
            if detalhes_log:
                # MUDANÇA: Adequação à nova assinatura da função
                registrar_log(pedido_id, editor_nome, 'EDIÇÃO DE ITENS', detalhes=detalhes_log)
            else:
                # MUDANÇA: Adequação à nova assinatura da função
                registrar_log(pedido_id, editor_nome, 'EDIÇÃO GERAL')
            criar_notificacao_edicao(pedido_id, editor_nome)

        return jsonify({'status': 'success'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    
@pedidos_bp.route('/<string:pedido_id>', methods=['DELETE'])
def deletar_pedido(pedido_id):
    try:
        ref = db.reference(f'pedidos/{pedido_id}')
        ref.delete()
        return jsonify({'status': 'success'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@pedidos_bp.route('/<string:pedido_id>/comprador', methods=['PUT'])
def atualizar_comprador(pedido_id):
    dados = request.get_json()
    comprador = dados.get('comprador')
    editor_nome = dados.get('editor_nome')
    if comprador is None: return jsonify({'error': 'Nome do comprador não enviado.'}), 400
    
    ref = db.reference(f'pedidos/{pedido_id}')
    comprador_antigo = ref.child('comprador').get() or "Ninguém"
    ref.update({'comprador': comprador})
    
    if editor_nome:
        criar_notificacao_edicao(pedido_id, editor_nome)
        detalhes = {'de': comprador_antigo, 'para': comprador}
        # MUDANÇA: Adequação à nova assinatura da função
        registrar_log(pedido_id, editor_nome, 'ATRIBUIÇÃO DE COMPRADOR', detalhes=detalhes)
    return jsonify({'status': 'success'})

@pedidos_bp.route('/<string:pedido_id>/status', methods=['PUT'])
def atualizar_status(pedido_id):
    dados = request.get_json()
    novo_status = dados.get('status')
    editor_nome = dados.get('editor_nome')
    if not novo_status: return jsonify({'error': 'Status não enviado.'}), 400

    ref = db.reference(f'pedidos/{pedido_id}')
    status_antigo = ref.child('status').get()
    
    if novo_status == 'OK':
        pedido_atual = ref.get()
        if not pedido_atual or not pedido_atual.get('comprador'):
             return jsonify({'message': 'É necessário atribuir um comprador antes de finalizar.'}), 400

    updates = {'status': novo_status}
    if novo_status == 'OK':
        updates['data_finalizacao'] = datetime.now(tz_cuiaba).isoformat()
    
    ref.update(updates)
    if editor_nome:
        criar_notificacao_edicao(pedido_id, editor_nome)
        detalhes = {'de': status_antigo, 'para': novo_status}
        # MUDANÇA: Adequação à nova assinatura da função
        registrar_log(pedido_id, editor_nome, 'MUDANÇA DE STATUS', detalhes=detalhes)
        if novo_status == 'OK':
            # MUDANÇA: Adequação à nova assinatura da função
            registrar_log(pedido_id, editor_nome, 'FINALIZAÇÃO')
            
    return jsonify({'status': 'success'})