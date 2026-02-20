# quadro_app/blueprints/sugestoes.py
from flask import Blueprint, request, jsonify
from datetime import datetime
from sqlalchemy import or_ 
from ..extensions import db, tz_cuiaba
from quadro_app.models import Sugestao, Usuario, ItemExcluido
from quadro_app.utils import criar_notificacao, registrar_log # Importe a função de notificação

sugestoes_bp = Blueprint('sugestoes', __name__, url_prefix='/api/sugestoes') 

def serialize_sugestao(s):
    return {
        'id': s.id,
        'vendedor': s.vendedor,
        'status': s.status,
        'comprador': s.comprador,
        'data_criacao': s.data_criacao,
        'itens': s.itens,
        'observacao_geral': s.observacao_geral
    }

@sugestoes_bp.route('/', methods=['POST'])
def criar_sugestao():
    dados = request.get_json()
    nova_sugestao = Sugestao(
        vendedor=dados.get('vendedor'),
        status='pendente',
        data_criacao=datetime.now(tz_cuiaba).isoformat(),
        itens=dados.get('itens', []),
        observacao_geral=dados.get('observacao_geral', '')
    )
    db.session.add(nova_sugestao)
    db.session.commit()
    
    # --- INÍCIO DA LÓGICA DE NOTIFICAÇÃO ---
    try:
        # 1. Encontra todos os usuários que têm a role 'Comprador'
        compradores = Usuario.query.filter_by(role='Comprador').all()
        
        # 2. Monta a mensagem da notificação
        vendedor_nome = nova_sugestao.vendedor or "Usuário"
        # Pega o código do primeiro item como referência
        codigo_ref = nova_sugestao.itens[0]['codigo'] if nova_sugestao.itens else 'N/A'
        mensagem = f"Nova sugestão de compra de {vendedor_nome}: '{codigo_ref}...'"
        
        # 3. Cria uma notificação no banco de dados para cada comprador
        for comprador in compradores:
            criar_notificacao(
                user_id=comprador.id, 
                mensagem=mensagem, 
                link='/sugestoes' # Link para a página de sugestões
            )
            
    except Exception as e:
        # A falha na notificação não deve impedir a criação da sugestão.
        # Apenas registramos o erro no console do servidor.
        print(f"ERRO ao criar notificação para nova sugestão: {e}")
    # --- FIM DA LÓGICA DE NOTIFICAÇÃO ---

    return jsonify({'status': 'success', 'id': nova_sugestao.id}), 201

# Rota para editar (PUT), deletar (DELETE) ou buscar uma sugestão específica (GET)
@sugestoes_bp.route('/<int:sugestao_id>', methods=['PUT', 'DELETE'])
def gerenciar_sugestao_especifica(sugestao_id):
    sugestao = Sugestao.query.get_or_404(sugestao_id)

    if request.method == 'PUT':
        dados = request.get_json()
        sugestao.itens = dados.get('itens', sugestao.itens)
        sugestao.observacao_geral = dados.get('observacao_geral', sugestao.observacao_geral)
        sugestao.vendedor = dados.get('vendedor', sugestao.vendedor)
        db.session.commit()
        return jsonify({'status': 'success'})

    if request.method == 'DELETE':
        db.session.delete(sugestao)
        db.session.commit()
        return jsonify({'status': 'success'})

@sugestoes_bp.route('/<int:sugestao_id>', methods=['PUT'])
def editar_sugestao(sugestao_id):
    dados = request.get_json()
    sugestao = Sugestao.query.get_or_404(sugestao_id)
    
    sugestao.itens = dados.get('itens', sugestao.itens)
    sugestao.observacao_geral = dados.get('observacao_geral', sugestao.observacao_geral)
    sugestao.vendedor = dados.get('vendedor', sugestao.vendedor)
    
    db.session.commit()
    return jsonify({'status': 'success'})

@sugestoes_bp.route('/<int:sugestao_id>/atender-itens', methods=['POST'])
def atender_itens_sugestao(sugestao_id):
    dados = request.get_json()
    itens_codigos = [i['codigo'] for i in dados.get('itens', [])]
    sugestao_original = Sugestao.query.get_or_404(sugestao_id)

    itens_atuais = sugestao_original.itens or []
    atendidos = []
    permanecem = []

    for item in itens_atuais:
        if item.get('codigo') in itens_codigos:
            item['status'] = 'atendido'
            atendidos.append(item)
        else:
            permanecem.append(item)

    if not atendidos:
        return jsonify({'error': 'Nenhum item selecionado'}), 400

    try:
        # Cria uma nova sugestão finalizada para o histórico
        nova_finalizada = Sugestao(
            vendedor=sugestao_original.vendedor,
            comprador=sugestao_original.comprador,
            status='atendido',
            data_criacao=datetime.now(tz_cuiaba).isoformat(),
            itens=atendidos,
            observacao_geral=f"Atendido de Ref #{sugestao_original.id}"
        )
        db.session.add(nova_finalizada)

        if permanecem:
            # Se sobrou algo, atualiza a original e move para cotação
            sugestao_original.itens = permanecem
            sugestao_original.status = 'em_cotacao'
        else:
            # Se não sobrou nada, deleta a original (ou marca como deletada)
            db.session.delete(sugestao_original)

        db.session.commit()
        return jsonify({'status': 'success'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@sugestoes_bp.route('/<int:sugestao_id>/mover-para-cotacao', methods=['PUT'])
def mover_para_cotacao(sugestao_id):
    sugestao = Sugestao.query.get_or_404(sugestao_id)
    sugestao.status = 'em_cotacao'
    db.session.commit()
    return jsonify({'status': 'success'})

@sugestoes_bp.route('/<int:sugestao_id>', methods=['DELETE'])
def deletar_sugestao(sugestao_id):
    editor_nome = request.json.get('editor_nome', 'Sistema') # Pega o nome do editor (se enviado)
    sugestao = Sugestao.query.get_or_404(sugestao_id)

    # --- LÓGICA DE SOFT DELETE ---
    item_excluido = ItemExcluido(
        tipo_item='Sugestao',
        item_id_original=str(sugestao.id),
        dados_item=serialize_sugestao(sugestao),
        excluido_por=editor_nome,
        data_exclusao=datetime.now(tz_cuiaba).isoformat()
    )
    db.session.add(item_excluido)
    # --- FIM ---

    registrar_log(sugestao_id, editor_nome, 'EXCLUSAO', detalhes={'info': 'Sugestão movida para a lixeira.'}, log_type='sugestoes')

    db.session.delete(sugestao)
    db.session.commit()
    return jsonify({'status': 'success'})

@sugestoes_bp.route('/<int:sugestao_id>/comprador', methods=['PUT'])
def atualizar_comprador_sugestao(sugestao_id):
    sugestao = Sugestao.query.get_or_404(sugestao_id)
    sugestao.comprador = request.json.get('comprador')
    db.session.commit()
    return jsonify({'status': 'success'})

@sugestoes_bp.route('/<int:sugestao_id>/cogitar', methods=['PUT'])
def cogitar_sugestao(sugestao_id):
    sugestao = Sugestao.query.get_or_404(sugestao_id)
    sugestao.status = 'cogitado'
    db.session.commit()
    return jsonify({'status': 'success'})

@sugestoes_bp.route('/<int:sugestao_id>/mover-itens', methods=['POST'])
def mover_itens_sugestao(sugestao_id):
    dados = request.get_json()
    itens_selecionados_codigos = [i['codigo'] for i in dados.get('itens', [])]
    novo_status = dados.get('novo_status')
    comprador_atual = dados.get('comprador') # Pegamos o comprador enviado

    sugestao_original = Sugestao.query.get_or_404(sugestao_id)
    
    # Atualiza o comprador na original também, por segurança
    sugestao_original.comprador = comprador_atual 

    if not itens_selecionados_codigos:
        sugestao_original.status = novo_status
        db.session.commit()
        return jsonify({'status': 'success'})

    # Lógica de Divisão
    a_mover = []
    permanecem = []
    for item in sugestao_original.itens:
        if item.get('codigo') in itens_selecionados_codigos:
            a_mover.append(item)
        else:
            permanecem.append(item)

    if not permanecem:
        sugestao_original.status = novo_status
    else:
        nova_sugestao = Sugestao(
            vendedor=sugestao_original.vendedor,
            comprador=comprador_atual, # NOVO: Garante o comprador no novo card
            status=novo_status,
            data_criacao=sugestao_original.data_criacao,
            itens=a_mover,
            observacao_geral=sugestao_original.observacao_geral
        )
        db.session.add(nova_sugestao)
        sugestao_original.itens = permanecem

    db.session.commit()
    return jsonify({'status': 'success'})

@sugestoes_bp.route('/sugestoes-paginadas', methods=['GET'])
def get_sugestoes_paginadas():
    status = request.args.get('status', 'pendente')
    limit = int(request.args.get('limit', 10))
    page = int(request.args.get('page', 0))
    search_term = request.args.get('search', '').lower().strip()
    
    # --- INÍCIO DA ALTERAÇÃO ---
    user_role = request.args.get('user_role')
    user_name = request.args.get('user_name')
    
    query = Sugestao.query.filter_by(status=status)

    # Lógica de restrição para Vendedores
    if user_role == 'Vendedor' and user_name:
        query = query.filter(Sugestao.vendedor == user_name)
    # --- FIM DA ALTERAÇÃO ---

    if search_term:
        search_filter = or_(
            Sugestao.vendedor.ilike(f'%{search_term}%'),
            Sugestao.comprador.ilike(f'%{search_term}%'),
            Sugestao.itens.cast(db.String).ilike(f'%{search_term}%')
        )
        query = query.filter(search_filter)

    pagination = query.order_by(Sugestao.data_criacao.desc()).paginate(page=page + 1, per_page=limit, error_out=False)
    
    def serialize_sugestao_local(s):
        return {
            'id': s.id, 'vendedor': s.vendedor, 'status': s.status,
            'comprador': s.comprador, 'data_criacao': s.data_criacao,
            'itens': s.itens, 'observacao_geral': s.observacao_geral
        }

    sugestoes = pagination.items
    tem_mais = pagination.has_next
    
    return jsonify({
        'sugestoes': [serialize_sugestao_local(s) for s in sugestoes],
        'temMais': tem_mais
    })