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
    itens_para_atender = dados.get('itens', [])
    sugestao = Sugestao.query.get_or_404(sugestao_id)

    itens_atuais = sugestao.itens or []
    for item_db in itens_atuais:
        for item_req in itens_para_atender:
            if (item_db.get('codigo') == item_req.get('codigo') and 
                str(item_db.get('quantidade', '1')) == str(item_req.get('quantidade', '1'))):
                item_db['status'] = 'atendido'
                break
    
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(sugestao, "itens")

    todos_atendidos = all(item.get('status') == 'atendido' for item in itens_atuais)
    algum_atendido = any(item.get('status') == 'atendido' for item in itens_atuais)

    if todos_atendidos:
        sugestao.status = 'atendido'
    elif algum_atendido:
        sugestao.status = 'parcialmente_atendido'
        
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

@sugestoes_bp.route('/<int:sugestao_id>/finalizar-parcial', methods=['POST'])
def finalizar_sugestao_parcial(sugestao_id):
    sugestao_original = Sugestao.query.get_or_404(sugestao_id)

    if sugestao_original.status != 'parcialmente_atendido':
        return jsonify({'error': 'Apenas sugestões parcialmente atendidas podem ser finalizadas desta forma.'}), 400

    itens_atendidos = [item for item in (sugestao_original.itens or []) if item.get('status') == 'atendido']
    itens_pendentes = [item for item in (sugestao_original.itens or []) if item.get('status') != 'atendido']

    now_iso = datetime.now(tz_cuiaba).isoformat()

    try:
        if itens_atendidos:
            nova_sugestao_atendida = Sugestao(
                vendedor=sugestao_original.vendedor,
                comprador=sugestao_original.comprador,
                observacao_geral=sugestao_original.observacao_geral,
                data_criacao=now_iso,
                status='atendido',
                itens=itens_atendidos
            )
            db.session.add(nova_sugestao_atendida)

        if itens_pendentes:
            nova_sugestao_pendente = Sugestao(
                vendedor=sugestao_original.vendedor,
                comprador=sugestao_original.comprador,
                observacao_geral=sugestao_original.observacao_geral,
                data_criacao=now_iso,
                status='cogitado',
                itens=itens_pendentes
            )
            db.session.add(nova_sugestao_pendente)
        
        db.session.delete(sugestao_original)
        
        db.session.commit()
        return jsonify({'status': 'success'})

    except Exception as e:
        db.session.rollback()
        print(f"ERRO ao finalizar sugestão parcial: {e}")
        return jsonify({'error': str(e)}), 500