# quadro_app/blueprints/pedidos.py
from flask import Blueprint, request, jsonify
from datetime import datetime
from sqlalchemy import func 
from ..extensions import tz_cuiaba, db
from quadro_app.models import Pedido, Usuario, ItemExcluido
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
        vendedor = Usuario.query.filter_by(nome=pedido.vendedor).first()
        if vendedor:
            tipo_texto = "Seu pedido de rua" if pedido.tipo_req == 'Pedido Produto' else "Sua atualização de orçamento"
            codigo_texto = pedido.codigo or (pedido.itens[0]['codigo'] if pedido.itens and pedido.itens[0] else 'N/A')
            
            # Notificação para "Pedido Efetuado"
            if novo_status == 'A Caminho':
                mensagem = f"{tipo_texto} '{codigo_texto}' foi efetuado por {editor_nome}."
                criar_notificacao(user_id=vendedor.id, mensagem=mensagem, link='/pedidos-a-caminho')
            
            # Notificação para "Mercadoria Chegou"
            elif novo_status == 'OK':
                pedido.data_finalizacao = datetime.now(tz_cuiaba).isoformat()
                mensagem = f"{tipo_texto} '{codigo_texto}' foi finalizado e a mercadoria recebida."
                criar_notificacao(user_id=vendedor.id, mensagem=mensagem, link='/historico')

    except Exception as e:
        print(f"ERRO ao criar notificação de status para o vendedor: {e}")

    db.session.commit()
    registrar_log(pedido_id, editor_nome, 'STATUS_ALTERADO', detalhes={'de': status_antigo, 'para': novo_status})
    return jsonify({'status': 'success'})


@pedidos_bp.route('/ativos', methods=['GET'])
def get_pedidos_ativos():
    # Agora não mostra mais os pedidos "A Caminho" nesta rota
    pedidos = Pedido.query.filter(Pedido.status.in_(['Aguardando', 'Em Cotação']))\
                         .order_by(Pedido.data_criacao.desc()).all()
    return jsonify([serialize_pedido(p) for p in pedidos])

# --- NOVA ROTA PARA A PÁGINA "PEDIDOS A CAMINHO" ---
@pedidos_bp.route('/a-caminho', methods=['GET'])
def get_pedidos_a_caminho():
    pedidos = Pedido.query.filter(Pedido.status == 'A Caminho')\
                         .order_by(Pedido.data_criacao.desc()).all()
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