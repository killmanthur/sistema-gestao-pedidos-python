from flask import Blueprint, request, jsonify
from datetime import datetime
from sqlalchemy import func # IMPORTAR func do SQLAlchemy
from quadro_app import db, tz_cuiaba
from quadro_app.models import Pedido, Usuario
from quadro_app.utils import registrar_log, criar_notificacao

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
    
    try:
        compradores = Usuario.query.filter_by(role='Comprador').all()
        tipo_texto = "Novo pedido de rua" if novo_pedido.tipo_req == 'Pedido Produto' else "Nova atualização de orçamento"
        codigo_texto = novo_pedido.codigo or (novo_pedido.itens[0]['codigo'] if novo_pedido.itens else 'N/A')
        mensagem = f"{tipo_texto} de {novo_pedido.vendedor}: '{codigo_texto}'"
        
        for comprador in compradores:
            criar_notificacao(user_id=comprador.id, mensagem=mensagem, link='/quadro')
            
    except Exception as e:
        print(f"ERRO ao criar notificação para novo pedido: {e}")

    return jsonify({'status': 'success', 'id': novo_pedido.id}), 201


@pedidos_bp.route('/<int:pedido_id>', methods=['PUT'])
def editar_pedido(pedido_id):
    dados = request.get_json()
    pedido = Pedido.query.get_or_404(pedido_id)
    
    comprador_antigo = pedido.comprador
    comprador_novo = dados.get('comprador')
    editor_nome = dados.get('editor_nome', 'Sistema')
    
    campos_permitidos = [
        'vendedor', 'comprador', 'status', 'observacao_geral', 
        'itens', 'codigo', 'descricao'
    ]

    for campo, valor in dados.items():
        if campo in campos_permitidos:
            setattr(pedido, campo, valor)

    db.session.commit()
    
    if comprador_novo and comprador_novo != comprador_antigo:
        usuario_comprador = Usuario.query.filter_by(nome=comprador_novo).first()
        if usuario_comprador:
            codigo_pedido = pedido.codigo or (pedido.itens[0]['codigo'] if pedido.itens else 'N/A')
            mensagem = f"{editor_nome} atribuiu o pedido '{codigo_pedido}' a você."
            criar_notificacao(usuario_comprador.id, mensagem, link='/quadro')

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
    return jsonify({'status': 'success'})

@pedidos_bp.route('/ativos', methods=['GET'])
def get_pedidos_ativos():
    pedidos = Pedido.query.filter(Pedido.status != 'OK').order_by(Pedido.data_criacao.desc()).all()
    return jsonify([serialize_pedido(p) for p in pedidos])

# --- INÍCIO DA NOVA ROTA ---
@pedidos_bp.route('/status-quadro', methods=['GET'])
def get_quadro_status():
    """
    Retorna o número de pedidos ativos e a data de criação do pedido mais recente.
    Isso permite que o frontend verifique de forma eficiente se algo mudou.
    """
    try:
        # Pega a contagem de pedidos ativos
        count = db.session.query(func.count(Pedido.id)).filter(Pedido.status != 'OK').scalar()

        # Pega a data de criação mais recente entre os pedidos ativos
        latest_timestamp_obj = db.session.query(func.max(Pedido.data_criacao)).filter(Pedido.status != 'OK').first()
        
        latest_timestamp = latest_timestamp_obj[0] if latest_timestamp_obj else None

        return jsonify({
            'total_ativos': count,
            'ultimo_update': latest_timestamp
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500
# --- FIM DA NOVA ROTA ---