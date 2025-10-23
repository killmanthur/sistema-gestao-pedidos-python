from flask import Blueprint, request, jsonify
from datetime import datetime
from quadro_app import db, tz_cuiaba
from quadro_app.models import Pedido
# A função de log também precisará ser adaptada para salvar em uma tabela de Log
# from quadro_app.utils import registrar_log 

pedidos_bp = Blueprint('pedidos', __name__, url_prefix='/api/pedidos')

def serialize_pedido(p):
    """Converte um objeto Pedido do SQLAlchemy em um dicionário."""
    return {
        'id': p.id,
        'vendedor': p.vendedor,
        'status': p.status,
        'tipo_req': p.tipo_req,
        'comprador': p.comprador,
        'data_criacao': p.data_criacao,
        'data_finalizacao': p.data_finalizacao,
        'observacao_geral': p.observacao_geral,
        'itens': p.itens,
        'codigo': p.codigo,
        'descricao': p.descricao
    }

@pedidos_bp.route('', methods=['POST'])
def criar_pedido():
    dados = request.get_json()
    novo_pedido = Pedido(
        vendedor=dados.get('vendedor'),
        status='Aguardando',
        tipo_req=dados.get('tipo_req'),
        comprador='',
        data_criacao=datetime.now(tz_cuiaba).isoformat()
    )
    if dados.get('tipo_req') == 'Pedido Produto':
        novo_pedido.itens = dados.get('itens', [])
        novo_pedido.observacao_geral = dados.get('observacao_geral', '')
    else:
        novo_pedido.codigo = dados.get('codigo', 'N/A')
        novo_pedido.descricao = dados.get('descricao', '')
    
    db.session.add(novo_pedido)
    db.session.commit()
    # registrar_log(...)
    return jsonify({'status': 'success', 'id': novo_pedido.id}), 201

@pedidos_bp.route('/<int:pedido_id>', methods=['PUT'])
def editar_pedido(pedido_id):
    dados = request.get_json()
    pedido = Pedido.query.get_or_404(pedido_id)
    
    # --- INÍCIO DA CORREÇÃO ---
    # Lista de campos que o frontend tem permissão para atualizar nesta rota.
    # Isso evita que um usuário mal-intencionado tente atualizar campos como 'id'.
    campos_permitidos = [
        'vendedor', 'comprador', 'status', 'observacao_geral', 
        'itens', 'codigo', 'descricao'
    ]

    # Itera sobre os dados recebidos e atualiza o objeto 'pedido'
    for campo, valor in dados.items():
        if campo in campos_permitidos:
            setattr(pedido, campo, valor) # setattr(objeto, 'nome_do_campo', valor)
    # --- FIM DA CORREÇÃO ---

    db.session.commit()
    
    # A função de log pode ser mais detalhada agora
    editor_nome = dados.get('editor_nome', 'N/A')
    # registrar_log(pedido_id, editor_nome, 'EDIÇÃO', detalhes=dados)

    return jsonify({'status': 'success'})

@pedidos_bp.route('/<int:pedido_id>', methods=['DELETE'])
def deletar_pedido(pedido_id):
    pedido = Pedido.query.get_or_404(pedido_id)
    db.session.delete(pedido)
    db.session.commit()
    return jsonify({'status': 'success'})

@pedidos_bp.route('/<int:pedido_id>/comprador', methods=['PUT'])
def atualizar_comprador(pedido_id):
    dados = request.get_json()
    pedido = Pedido.query.get_or_404(pedido_id)
    pedido.comprador = dados.get('comprador')
    db.session.commit()
    # registrar_log(...)
    return jsonify({'status': 'success'})

@pedidos_bp.route('/<int:pedido_id>/status', methods=['PUT'])
def atualizar_status(pedido_id):
    dados = request.get_json()
    novo_status = dados.get('status')
    pedido = Pedido.query.get_or_404(pedido_id)
    
    if novo_status == 'OK' and not pedido.comprador:
        return jsonify({'message': 'É necessário atribuir um comprador antes de finalizar.'}), 400

    pedido.status = novo_status
    if novo_status == 'OK':
        pedido.data_finalizacao = datetime.now(tz_cuiaba).isoformat()
    
    db.session.commit()
    # registrar_log(...)
    return jsonify({'status': 'success'})

@pedidos_bp.route('/ativos', methods=['GET'])
def get_pedidos_ativos():
    pedidos = Pedido.query.filter(Pedido.status != 'OK').order_by(Pedido.data_criacao.desc()).all()
    return jsonify([serialize_pedido(p) for p in pedidos])