# quadro_app/blueprints/sugestoes.py
from flask import Blueprint, request, jsonify
from datetime import datetime
import time
from quadro_app import db, tz_cuiaba

sugestoes_bp = Blueprint('sugestoes', __name__, url_prefix='/api')

@sugestoes_bp.route('/sugestoes', methods=['POST'])
def criar_sugestao():
    dados = request.get_json()
    if not dados: return jsonify({'error': 'Requisição sem dados'}), 400

    vendedor_nome = dados.get('vendedor', 'N/A')
    nova_sugestao_data = {
        'vendedor': vendedor_nome,
        'status': 'pendente',
        'comprador': '',
        'data_criacao': datetime.now(tz_cuiaba).isoformat(),
        'itens': dados.get('itens', []),
        'observacao_geral': dados.get('observacao_geral', '')
    }
    ref = db.reference('sugestoes')
    nova_sugestao_ref = ref.push(nova_sugestao_data)
    
    try:
        usuarios_ref = db.reference('usuarios')
        todos_usuarios = usuarios_ref.get()
        if todos_usuarios:
            timestamp = int(time.time() * 1000)
            mensagem = f"Nova sugestão de compra adicionada por {vendedor_nome}."
            
            for uid, user_data in todos_usuarios.items():
                if user_data.get('role') in ['Admin', 'Comprador']:
                    notificacao_ref = db.reference(f'notificacoes/{uid}')
                    notificacao_ref.push({
                        'mensagem': mensagem,
                        'pedidoId': nova_sugestao_ref.key,
                        'tipo': 'sugestao',
                        'lida': False,
                        'timestamp': timestamp
                    })
    except Exception as e:
        print(f"ERRO ao criar notificação para nova sugestão: {e}")

    return jsonify({'status': 'success'}), 201

@sugestoes_bp.route('/sugestoes/<string:sugestao_id>', methods=['PUT'])
def editar_sugestao(sugestao_id):
    dados = request.get_json()
    if not dados: return jsonify({'error': 'Requisição sem dados'}), 400
    try:
        ref = db.reference(f'sugestoes/{sugestao_id}')
        ref.update(dados)
        return jsonify({'status': 'success'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    
@sugestoes_bp.route('/sugestoes/<string:sugestao_id>/atender-itens', methods=['POST'])
def atender_itens_sugestao(sugestao_id):
    dados = request.get_json()
    itens_para_atender = dados.get('itens')
    if not itens_para_atender: return jsonify({'error': 'Nenhum item selecionado.'}), 400

    try:
        sugestao_ref = db.reference(f'sugestoes/{sugestao_id}')
        sugestao_atual = sugestao_ref.get()
        if not sugestao_atual: return jsonify({'error': 'Sugestão não encontrada.'}), 404

        itens_atuais = sugestao_atual.get('itens', [])
        for item_db in itens_atuais:
            for item_req in itens_para_atender:
                if item_db.get('codigo') == item_req.get('codigo') and str(item_db.get('quantidade')) == str(item_req.get('quantidade')):
                    item_db['status'] = 'atendido'
                    break
        
        todos_atendidos = all(item.get('status') == 'atendido' for item in itens_atuais)
        algum_atendido = any(item.get('status') == 'atendido' for item in itens_atuais)

        novo_status_principal = 'pendente'
        if todos_atendidos: novo_status_principal = 'atendido'
        elif algum_atendido: novo_status_principal = 'parcialmente_atendido'
        
        sugestao_ref.update({'itens': itens_atuais, 'status': novo_status_principal})
        return jsonify({'status': 'success'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@sugestoes_bp.route('/sugestoes/<string:sugestao_id>', methods=['DELETE'])
def deletar_sugestao(sugestao_id):
    ref = db.reference(f'sugestoes/{sugestao_id}')
    ref.delete()
    return jsonify({'status': 'success'})

@sugestoes_bp.route('/sugestoes/<string:sugestao_id>/comprador', methods=['PUT'])
def atualizar_comprador_sugestao(sugestao_id):
    dados = request.get_json()
    comprador = dados.get('comprador')
    if comprador is None: return jsonify({'error': 'Nome do comprador não enviado.'}), 400
    try:
        ref = db.reference(f'sugestoes/{sugestao_id}')
        ref.update({'comprador': comprador})
        return jsonify({'status': 'success'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@sugestoes_bp.route('/sugestoes/<string:sugestao_id>/atender', methods=['PUT'])
def atender_sugestao(sugestao_id):
    ref = db.reference(f'sugestoes/{sugestao_id}')
    ref.update({'status': 'atendido'})
    return jsonify({'status': 'success'})

@sugestoes_bp.route('/sugestoes/<string:sugestao_id>/cogitar', methods=['PUT'])
def cogitar_sugestao(sugestao_id):
    ref = db.reference(f'sugestoes/{sugestao_id}')
    ref.update({'status': 'cogitado'})
    return jsonify({'status': 'success'})

@sugestoes_bp.route('/sugestoes/<string:sugestao_id>/pedir', methods=['PUT'])
def pedir_sugestao_cogitada(sugestao_id):
    ref = db.reference(f'sugestoes/{sugestao_id}')
    ref.update({'status': 'atendido'})
    return jsonify({'status': 'success'})

@sugestoes_bp.route('/sugestoes/<string:sugestao_id>/remover-item', methods=['POST'])
def remover_item_sugestao(sugestao_id):
    dados = request.get_json()
    item_para_remover = dados.get('item')
    if not item_para_remover: return jsonify({'error': 'Dados do item não fornecidos.'}), 400
    try:
        sugestao_ref = db.reference(f'sugestoes/{sugestao_id}')
        sugestao_atual = sugestao_ref.get()
        if not sugestao_atual: return jsonify({'error': 'Sugestão não encontrada.'}), 404

        itens_atuais = sugestao_atual.get('itens', [])
        itens_atualizados = [
            item for item in itens_atuais 
            if not (item.get('codigo') == item_para_remover.get('codigo') and 
                    str(item.get('quantidade')) == str(item_para_remover.get('quantidade')))
        ]
        if not itens_atualizados:
            sugestao_ref.delete()
            return jsonify({'status': 'success', 'message': 'Último item removido e sugestão excluída.'})
        
        sugestao_ref.update({'itens': itens_atualizados})
        return jsonify({'status': 'success', 'message': 'Item removido com sucesso.'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@sugestoes_bp.route('/sugestoes/<string:sugestao_id>/finalizar-parcial', methods=['POST'])
def finalizar_sugestao_parcial(sugestao_id):
    try:
        sugestao_original_ref = db.reference(f'sugestoes/{sugestao_id}')
        sugestao_original = sugestao_original_ref.get()
        if not sugestao_original: return jsonify({'error': 'Sugestão original não encontrada.'}), 404

        itens_atendidos = [item for item in sugestao_original.get('itens', []) if item.get('status') == 'atendido']
        itens_pendentes = [item for item in sugestao_original.get('itens', []) if item.get('status') != 'atendido']

        sugestoes_ref = db.reference('sugestoes')
        now_cuiaba_iso = datetime.now(tz_cuiaba).isoformat()
        
        base_sugestao = {
            'vendedor': sugestao_original.get('vendedor', 'N/A'),
            'comprador': sugestao_original.get('comprador', ''),
            'observacao_geral': sugestao_original.get('observacao_geral', ''),
            'data_criacao': now_cuiaba_iso,
        }

        if itens_atendidos:
            nova_sugestao_atendida = {**base_sugestao, 'status': 'atendido', 'itens': itens_atendidos}
            sugestoes_ref.push(nova_sugestao_atendida)

        if itens_pendentes:
            nova_sugestao_pendente = {**base_sugestao, 'status': 'cogitado', 'itens': itens_pendentes}
            sugestoes_ref.push(nova_sugestao_pendente)
        
        sugestao_original_ref.delete()
        return jsonify({'status': 'success'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    
@sugestoes_bp.route('/sugestoes-paginadas', methods=['GET'])
def get_sugestoes_paginadas():
    try:
        status = request.args.get('status', 'pendente')
        limit = int(request.args.get('limit', 10))
        page = int(request.args.get('page', 0))
        search_term = request.args.get('search', '').lower().strip()
        offset = page * limit

        query = db.reference('sugestoes').order_by_child('status').equal_to(status)
        snapshot = query.get() or {}

        sugestoes_com_id = [{'id': key, **value} for key, value in snapshot.items()]
            
        sugestoes_filtradas = []
        if search_term:
            for s in sugestoes_com_id:
                if (search_term in s.get('vendedor', '').lower() or
                    search_term in s.get('comprador', '').lower() or
                    search_term in s.get('observacao_geral', '').lower() or
                    any(search_term in item.get('codigo', '').lower() for item in s.get('itens', []))):
                    sugestoes_filtradas.append(s)
        else:
            sugestoes_filtradas = sugestoes_com_id

        sugestoes_ordenadas = sorted(sugestoes_filtradas, key=lambda x: x.get('data_criacao', ''), reverse=True)
        itens_da_pagina = sugestoes_ordenadas[offset : offset + limit]
        tem_mais = (offset + limit) < len(sugestoes_ordenadas)

        return jsonify({'sugestoes': itens_da_pagina, 'temMais': tem_mais})
    except Exception as e:
        return jsonify({'error': str(e)}), 500