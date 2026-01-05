# quadro_app/blueprints/pedidos.py
from flask import Blueprint, request, jsonify
from datetime import datetime
from sqlalchemy import func 
from ..extensions import tz_cuiaba, db
from quadro_app.models import Pedido, Usuario, ItemExcluido
from quadro_app.utils import registrar_log, criar_notificacao 
from quadro_app import socketio

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

def comparar_listas_itens(itens_antigos, itens_novos):
    """Compara duas listas de itens e retorna um resumo das mudanças."""
    mapa_antigo = {item['codigo']: item.get('quantidade', 1) for item in (itens_antigos or [])}
    mapa_novo = {item['codigo']: item.get('quantidade', 1) for item in (itens_novos or [])}
    
    adicionado = []
    removido = []
    modificado = []

    codigos_novos = set(mapa_novo.keys())
    codigos_antigos = set(mapa_antigo.keys())

    for codigo in codigos_novos - codigos_antigos:
        adicionado.append(f"{mapa_novo[codigo]}x {codigo}")
        
    for codigo in codigos_antigos - codigos_novos:
        removido.append(f"{mapa_antigo[codigo]}x {codigo}")

    for codigo in codigos_antigos.intersection(codigos_novos):
        if str(mapa_antigo[codigo]) != str(mapa_novo[codigo]):
            modificado.append(f"{codigo} ({mapa_antigo[codigo]}x -> {mapa_novo[codigo]}x)")
    
    mudancas = {}
    if adicionado: mudancas['adicionado'] = adicionado
    if removido: mudancas['removido'] = removido
    if modificado: mudancas['modificado'] = modificado
    return mudancas


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

    registrar_log(novo_pedido.id, dados.get('vendedor'), 'CRIACAO')
    
    try:
     # Busca todos os compradores
        compradores = Usuario.query.filter_by(role='Comprador').all()
        for comprador in compradores:
          # A função criar_notificacao já salva no banco E emite o socketio.emit
          criar_notificacao(
            user_id=comprador.id, 
            mensagem=f"Novo pedido de rua: {novo_pedido.vendedor}",
            link='/quadro'
        )
    except Exception as e:
         print(f"Erro ao notificar compradores: {e}")

    socketio.emit('quadro_atualizado', {'message': 'Novo pedido criado'})

    return jsonify({'status': 'success', 'id': novo_pedido.id}), 201


@pedidos_bp.route('/<int:pedido_id>', methods=['PUT'])
def editar_pedido(pedido_id):
    dados = request.get_json()
    pedido = Pedido.query.get_or_404(pedido_id)
    
    editor_nome = dados.pop('editor_nome', 'Sistema')
    
    estado_antigo = {
        'comprador': pedido.comprador,
        'itens': pedido.itens[:] if pedido.itens else [],
        'codigo': pedido.codigo,
        'observacao_geral': pedido.observacao_geral
    }
    
    comprador_antigo = pedido.comprador
    comprador_novo = dados.get('comprador')
    
    pedido.vendedor = dados.get('vendedor', pedido.vendedor)
    pedido.comprador = dados.get('comprador', pedido.comprador)
    pedido.observacao_geral = dados.get('observacao_geral', pedido.observacao_geral)
    pedido.itens = dados.get('itens', pedido.itens)
    pedido.codigo = dados.get('codigo', pedido.codigo)
    pedido.descricao = dados.get('descricao', pedido.descricao)

    db.session.commit()
    
    detalhes_log = {}
    if comprador_novo and comprador_novo != estado_antigo['comprador']:
        detalhes_log['comprador'] = {'de': estado_antigo['comprador'] or 'N/A', 'para': comprador_novo}
    
    if dados.get('observacao_geral') != estado_antigo['observacao_geral']:
        detalhes_log['observacao'] = {'de': estado_antigo['observacao_geral'] or 'N/A', 'para': dados.get('observacao_geral')}

    if 'itens' in dados:
        mudancas_itens = comparar_listas_itens(estado_antigo['itens'], dados['itens'])
        if mudancas_itens:
            detalhes_log.update(mudancas_itens)

    if detalhes_log:
        registrar_log(pedido_id, editor_nome, 'EDICAO', detalhes=detalhes_log)

    if comprador_novo and comprador_novo != comprador_antigo:
        usuario_comprador = Usuario.query.filter_by(nome=comprador_novo).first()
        if usuario_comprador:
            codigo_pedido = pedido.codigo or (pedido.itens[0]['codigo'] if pedido.itens else 'N/A')
            mensagem = f"{editor_nome} atribuiu o pedido '{codigo_pedido}' a você."
            criar_notificacao(usuario_comprador.id, mensagem, link='/quadro')
    
    socketio.emit('quadro_atualizado', {'message': f'Pedido {pedido_id} editado'})

    return jsonify({'status': 'success'})

@pedidos_bp.route('/<int:pedido_id>', methods=['DELETE'])
def deletar_pedido(pedido_id):
    editor_nome = request.json.get('editor_nome', 'Sistema')
    pedido = Pedido.query.get_or_404(pedido_id)

    item_excluido = ItemExcluido(
        tipo_item='Pedido',
        item_id_original=str(pedido.id),
        dados_item=serialize_pedido(pedido),
        excluido_por=editor_nome,
        data_exclusao=datetime.now(tz_cuiaba).isoformat()
    )
    db.session.add(item_excluido)

    registrar_log(pedido_id, editor_nome, 'EXCLUSAO', detalhes={'info': f"Pedido tipo '{pedido.tipo_req}' do vendedor '{pedido.vendedor}' movido para a lixeira."})

    db.session.delete(pedido)
    db.session.commit()

    socketio.emit('quadro_atualizado', {'message': f'Pedido {pedido_id} excluído'})

    return jsonify({'status': 'success'})

# --- ROTA DE STATUS MODIFICADA ---
@pedidos_bp.route('/<int:pedido_id>/status', methods=['PUT'])
def atualizar_status(pedido_id):
    dados = request.get_json()
    novo_status = dados.get('status')
    editor_nome = dados.get('editor_nome', 'Sistema')
    pedido = Pedido.query.get_or_404(pedido_id)
    
    if (novo_status == 'OK' or novo_status == 'A Caminho') and not pedido.comprador:
        return jsonify({'message': 'É necessário atribuir um comprador antes de continuar.'}), 400

    status_antigo = pedido.status
    pedido.status = novo_status
    
    # Lógica de notificação para o vendedor
    try:
        # Busca o objeto usuário do vendedor
        vendedor = Usuario.query.filter_by(nome=pedido.vendedor).first()
        
        if vendedor:
            tipo_texto = "Seu pedido de rua" if pedido.tipo_req == 'Pedido Produto' else "Sua atualização de orçamento"
            # Pega o código ou o primeiro item para identificar
            codigo_texto = pedido.codigo or (pedido.itens[0]['codigo'] if pedido.itens and pedido.itens[0] else 'N/A')
            
            # --- CENÁRIO 1: Pedido foi feito (Status vira 'A Caminho') ---
            if novo_status == 'A Caminho':
                mensagem = f"COMPRADO: {tipo_texto} '{codigo_texto}' já foi pedido!"
                # Link leva para a página de pedidos a caminho
                criar_notificacao(user_id=vendedor.id, mensagem=mensagem, link='/pedidos-a-caminho')
            
            # --- CENÁRIO 2: Mercadoria chegou (Status vira 'OK') ---
            elif novo_status == 'OK':
                pedido.data_finalizacao = datetime.now(tz_cuiaba).isoformat()
                mensagem = f"CHEGOU: {tipo_texto} '{codigo_texto}' está disponível para retirada."
                # Link leva para o histórico ou onde ele possa ver o finalizado
                criar_notificacao(user_id=vendedor.id, mensagem=mensagem, link='/historico')

    except Exception as e:
        print(f"ERRO ao criar notificação de status para o vendedor: {e}")

    db.session.commit()
    registrar_log(pedido_id, editor_nome, 'STATUS_ALTERADO', detalhes={'de': status_antigo, 'para': novo_status})

    socketio.emit('quadro_atualizado', {'message': f'Status do pedido {pedido_id} alterado'})

    return jsonify({'status': 'success'})

@pedidos_bp.route('/<int:pedido_id>/comprador', methods=['PUT'])
def atualizar_comprador_pedido(pedido_id):
    dados = request.get_json()
    novo_comprador = dados.get('comprador')
    editor_nome = dados.get('editor_nome', 'Sistema')
    
    pedido = Pedido.query.get_or_404(pedido_id)
    
    comprador_antigo = pedido.comprador
    pedido.comprador = novo_comprador
    
    db.session.commit()
    
    # Registra no Log
    registrar_log(
        pedido_id, 
        editor_nome, 
        'COMPRADOR_ALTERADO', 
        detalhes={'de': comprador_antigo or 'N/A', 'para': novo_comprador or 'N/A'}
    )

    socketio.emit('quadro_atualizado', {'message': f'Comprador atualizado no pedido {pedido_id}'})
    
    # Envia Notificação para o Comprador atribuído
    try:
        if novo_comprador and novo_comprador != comprador_antigo:
            # Busca o usuário pelo nome para pegar o ID
            usuario_comprador = Usuario.query.filter_by(nome=novo_comprador).first()
            if usuario_comprador:
                codigo_texto = pedido.codigo or (pedido.itens[0]['codigo'] if pedido.itens else 'N/A')
                mensagem = f"{editor_nome} atribuiu o pedido '{codigo_texto}' a você."
                criar_notificacao(user_id=usuario_comprador.id, mensagem=mensagem, link='/quadro')
    except Exception as e:
        print(f"ERRO ao criar notificação de atribuição de comprador: {e}")
    
    socketio.emit('comprador_atualizado', {'message': f'Comprador do pedido {pedido_id} alterado'})

    return jsonify({'status': 'success'})

@pedidos_bp.route('/ativos', methods=['GET'])
def get_pedidos_ativos():
    # --- INÍCIO DA ALTERAÇÃO ---
    user_role = request.args.get('user_role')
    user_name = request.args.get('user_name')

    query = Pedido.query.filter(Pedido.status.in_(['Aguardando', 'Em Cotação']))
    
    # Se for Vendedor, filtra pelo nome dele
    if user_role == 'Vendedor' and user_name:
        query = query.filter(Pedido.vendedor == user_name)

    pedidos = query.order_by(Pedido.data_criacao.desc()).all()
    # --- FIM DA ALTERAÇÃO ---
    
    return jsonify([serialize_pedido(p) for p in pedidos])

# --- NOVA ROTA PARA A PÁGINA "PEDIDOS A CAMINHO" ---
@pedidos_bp.route('/a-caminho', methods=['GET'])
def get_pedidos_a_caminho():
    # --- INÍCIO DA ALTERAÇÃO ---
    user_role = request.args.get('user_role')
    user_name = request.args.get('user_name')

    query = Pedido.query.filter(Pedido.status == 'A Caminho')

    # Se for Vendedor, filtra pelo nome dele
    if user_role == 'Vendedor' and user_name:
        query = query.filter(Pedido.vendedor == user_name)

    pedidos = query.order_by(Pedido.data_criacao.desc()).all()
    # --- FIM DA ALTERAÇÃO ---

    return jsonify([serialize_pedido(p) for p in pedidos])


@pedidos_bp.route('/status-quadro', methods=['GET'])
def get_quadro_status():
    try:
        count = db.session.query(func.count(Pedido.id)).filter(Pedido.status.in_(['Aguardando', 'Em Cotação'])).scalar()
        latest_timestamp_obj = db.session.query(func.max(Pedido.data_criacao)).filter(Pedido.status.in_(['Aguardando', 'Em Cotação'])).first()
        latest_timestamp = latest_timestamp_obj[0] if latest_timestamp_obj else None

        return jsonify({
            'total_ativos': count,
            'ultimo_update': latest_timestamp
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500