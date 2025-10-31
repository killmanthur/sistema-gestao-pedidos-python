from flask import Blueprint, request, jsonify
from datetime import datetime
from sqlalchemy import func # IMPORTAR func do SQLAlchemy
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

    # Itens adicionados
    for codigo in codigos_novos - codigos_antigos:
        adicionado.append(f"{mapa_novo[codigo]}x {codigo}")
        
    # Itens removidos
    for codigo in codigos_antigos - codigos_novos:
        removido.append(f"{mapa_antigo[codigo]}x {codigo}")

    # Itens modificados
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
    
    # Captura o estado antigo para um log detalhado
    estado_antigo = {
        'comprador': pedido.comprador,
        'itens': pedido.itens[:] if pedido.itens else [], # Cria uma cópia
        'codigo': pedido.codigo,
        'observacao_geral': pedido.observacao_geral
    }
    
    comprador_antigo = pedido.comprador
    comprador_novo = dados.get('comprador')
    
    # Atualiza o objeto
    pedido.vendedor = dados.get('vendedor', pedido.vendedor)
    pedido.comprador = dados.get('comprador', pedido.comprador)
    pedido.observacao_geral = dados.get('observacao_geral', pedido.observacao_geral)
    pedido.itens = dados.get('itens', pedido.itens)
    pedido.codigo = dados.get('codigo', pedido.codigo)
    pedido.descricao = dados.get('descricao', pedido.descricao)

    db.session.commit()
    
    # Monta o log detalhado
    detalhes_log = {}
    if comprador_novo and comprador_novo != estado_antigo['comprador']:
        detalhes_log['comprador'] = {'de': estado_antigo['comprador'] or 'N/A', 'para': comprador_novo}
    
    if dados.get('observacao_geral') != estado_antigo['observacao_geral']:
        detalhes_log['observacao'] = {'de': estado_antigo['observacao_geral'] or 'N/A', 'para': dados.get('observacao_geral')}

    # --- LÓGICA DE COMPARAÇÃO DE ITENS ---
    if 'itens' in dados:
        mudancas_itens = comparar_listas_itens(estado_antigo['itens'], dados['itens'])
        if mudancas_itens:
            # Mescla as mudanças de itens no log principal
            detalhes_log.update(mudancas_itens)

    if detalhes_log:
        registrar_log(pedido_id, editor_nome, 'EDICAO', detalhes=detalhes_log)

    # Lógica de notificação
    if comprador_novo and comprador_novo != comprador_antigo:
        # ... (código de notificação permanece o mesmo)
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

    # --- INÍCIO DA LÓGICA DE SOFT DELETE ---
    item_excluido = ItemExcluido(
        tipo_item='Pedido',
        item_id_original=str(pedido.id),
        dados_item=serialize_pedido(pedido), # Usa a função que já temos para serializar
        excluido_por=editor_nome,
        data_exclusao=datetime.now(tz_cuiaba).isoformat()
    )
    db.session.add(item_excluido)
    # --- FIM DA LÓGICA DE SOFT DELETE ---

    registrar_log(pedido_id, editor_nome, 'EXCLUSAO', detalhes={'info': f"Pedido tipo '{pedido.tipo_req}' do vendedor '{pedido.vendedor}' movido para a lixeira."})

    db.session.delete(pedido) # Move o item para a lixeira
    db.session.commit()
    return jsonify({'status': 'success'})

@pedidos_bp.route('/<int:pedido_id>/comprador', methods=['PUT'])
def atualizar_comprador(pedido_id):
    dados = request.get_json()
    if not dados:
        return jsonify({'error': 'Corpo da requisição vazio'}), 400

    pedido = Pedido.query.get_or_404(pedido_id)

    # --- INÍCIO DA CORREÇÃO ---
    
    # 1. Obter as variáveis necessárias
    editor_nome = dados.get('editor_nome', 'Sistema')
    comprador_antigo = pedido.comprador
    comprador_novo = dados.get('comprador')

    # 2. Atualizar o valor no banco de dados
    pedido.comprador = comprador_novo
    db.session.commit()

    # 3. Registrar o log com as variáveis e a ação corretas
    registrar_log(
        pedido_id, 
        editor_nome, 
        'COMPRADOR_ALTERADO', 
        detalhes={'comprador': {'de': comprador_antigo or 'N/A', 'para': comprador_novo or 'N/A'}}
    )

    # 4. Enviar notificação se houver um novo comprador
    if comprador_novo and comprador_novo != comprador_antigo:
        usuario_comprador = Usuario.query.filter_by(nome=comprador_novo).first()
        if usuario_comprador:
            codigo_pedido = pedido.codigo or (pedido.itens[0]['codigo'] if pedido.itens else 'N/A')
            mensagem = f"{editor_nome} atribuiu o pedido '{codigo_pedido}' a você."
            criar_notificacao(usuario_comprador.id, mensagem, link='/quadro')

    return jsonify({'status': 'success'})

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