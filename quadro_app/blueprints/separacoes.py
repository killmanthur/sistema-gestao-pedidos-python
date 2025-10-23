# quadro_app/blueprints/separacoes.py
from flask import Blueprint, request, jsonify
from datetime import datetime
from sqlalchemy import or_
from quadro_app import db, tz_cuiaba
from quadro_app.models import Separacao, Usuario

separacoes_bp = Blueprint('separacoes', __name__, url_prefix='/api/separacoes')

def _atualizar_fila_separadores_sql(separador_designado_nome):
    """
    Move o separador designado para o final da fila, dando a ele a menor prioridade.
    """
    try:
        # Encontra a menor prioridade entre todos os separadores
        min_prioridade_obj = db.session.query(db.func.min(Usuario.prioridade_fila))\
                                      .filter_by(role='Separador').first()
        menor_prioridade = min_prioridade_obj[0] if min_prioridade_obj and min_prioridade_obj[0] is not None else 0

        # Encontra o usuário que foi designado
        separador_designado = Usuario.query.filter_by(role='Separador', nome=separador_designado_nome).first()

        if separador_designado:
            # Define a prioridade dele como a menor - 1, colocando-o no final
            separador_designado.prioridade_fila = menor_prioridade - 1
            db.session.commit()
    except Exception as e:
        db.session.rollback()
        print(f"ERRO ao atualizar a ordem da fila de separadores: {e}")

@separacoes_bp.route('/fila-separadores', methods=['GET'])
def get_fila_endpoint():
    """Retorna a lista ordenada de nomes dos separadores ativos na fila."""
    try:
        separadores_ativos = Usuario.query.filter_by(role='Separador', ativo_na_fila=True)\
                                          .order_by(Usuario.prioridade_fila.desc(), Usuario.nome).all()
        nomes = [u.nome for u in separadores_ativos if u.nome and u.nome.lower() != 'separacao']
        return jsonify(nomes)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@separacoes_bp.route('/status-todos-separadores', methods=['GET'])
def get_status_todos_separadores():
    """Retorna todos os separadores e seu status de atividade na fila."""
    try:
        todos_separadores = Usuario.query.filter_by(role='Separador').order_by(Usuario.nome).all()
        resultado = [
            {'nome': u.nome, 'ativo': u.ativo_na_fila}
            for u in todos_separadores if u.nome and u.nome.lower() != 'separacao'
        ]
        return jsonify(resultado)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@separacoes_bp.route('/fila-separadores', methods=['PUT'])
def atualizar_fila_e_status():
    """Recebe uma lista de nomes que devem estar ativos e atualiza o status no banco."""
    try:
        nomes_ativos_recebidos = request.get_json()
        if not isinstance(nomes_ativos_recebidos, list):
            return jsonify({'error': 'O corpo da requisição deve ser uma lista de nomes.'}), 400

        todos_separadores = Usuario.query.filter_by(role='Separador').all()
        
        # Encontra a maior prioridade atual para atribuir aos novos ativados
        max_prioridade_obj = db.session.query(db.func.max(Usuario.prioridade_fila)).filter_by(role='Separador').first()
        maior_prioridade = max_prioridade_obj[0] if max_prioridade_obj and max_prioridade_obj[0] is not None else 0

        for user in todos_separadores:
            estava_ativo = user.ativo_na_fila
            esta_na_lista = user.nome in nomes_ativos_recebidos

            if esta_na_lista:
                user.ativo_na_fila = True
                if not estava_ativo: # Se está sendo ativado agora
                    maior_prioridade += 1
                    user.prioridade_fila = maior_prioridade
            else:
                user.ativo_na_fila = False
        
        db.session.commit()
        return jsonify({'status': 'success'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

def serialize_separacao(s):
    """Converte um objeto Separacao do SQLAlchemy em um dicionário."""
    return {
        'id': s.id,
        'numero_movimentacao': s.numero_movimentacao,
        'nome_cliente': s.nome_cliente,
        'separador_nome': s.separador_nome,
        'vendedor_nome': s.vendedor_nome,
        'status': s.status,
        'data_criacao': s.data_criacao,
        'data_inicio_conferencia': s.data_inicio_conferencia,
        'data_finalizacao': s.data_finalizacao,
        'conferente_nome': s.conferente_nome,
        'observacoes': s.observacoes
    }

@separacoes_bp.route('', methods=['POST'])
def criar_separacao():
    dados = request.get_json()
    num_mov = dados.get('numero_movimentacao')
    separador_nome = dados.get('separador_nome') # Pega o nome do separador usado

    if not num_mov or len(str(num_mov)) != 6:
        return jsonify({'error': 'O Nº de Movimentação deve ter exatamente 6 dígitos.'}), 400

    existente = Separacao.query.filter_by(numero_movimentacao=num_mov).first()
    if existente:
        return jsonify({'error': f'O número de movimentação {num_mov} já existe.'}), 409

    nova_separacao = Separacao(
        numero_movimentacao=num_mov,
        nome_cliente=dados.get('nome_cliente'),
        separador_nome=separador_nome,
        vendedor_nome=dados.get('vendedor_nome'),
        status='Em Separação',
        data_criacao=datetime.now(tz_cuiaba).isoformat()
    )
    db.session.add(nova_separacao)
    db.session.commit()

    # --- CORREÇÃO AQUI ---
    # Após salvar a nova separação, atualiza a fila.
    if separador_nome:
        _atualizar_fila_separadores_sql(separador_nome)
    # --- FIM DA CORREÇÃO ---
    
    return jsonify({'status': 'success', 'id': nova_separacao.id}), 201

@separacoes_bp.route('/<int:separacao_id>', methods=['PUT'])
def editar_separacao(separacao_id):
    dados = request.get_json()
    separacao = Separacao.query.get_or_404(separacao_id)

    if 'conferente_nome' in dados and dados.get('conferente_nome') and separacao.status == 'Em Separação':
        separacao.status = 'Em Conferência'
        separacao.data_inicio_conferencia = datetime.now(tz_cuiaba).isoformat()
    
    # Atualiza todos os campos enviados no JSON
    for key, value in dados.items():
        if hasattr(separacao, key):
            setattr(separacao, key, value)
            
    db.session.commit()
    return jsonify({'status': 'success'})

@separacoes_bp.route('/<int:separacao_id>', methods=['DELETE'])
def deletar_separacao(separacao_id):
    separacao = Separacao.query.get_or_404(separacao_id)
    db.session.delete(separacao)
    db.session.commit()
    return jsonify({'status': 'success'})

@separacoes_bp.route('/<int:separacao_id>/status', methods=['PUT'])
def atualizar_status_separacao(separacao_id):
    dados = request.get_json()
    novo_status = dados.get('status')
    separacao = Separacao.query.get_or_404(separacao_id)
    
    separacao.status = novo_status
    if novo_status == 'Finalizado':
        separacao.data_finalizacao = datetime.now(tz_cuiaba).isoformat()
        
    db.session.commit()
    return jsonify({'status': 'success'})

@separacoes_bp.route('/<int:separacao_id>/observacao', methods=['POST'])
def adicionar_observacao(separacao_id):
    dados = request.get_json()
    separacao = Separacao.query.get_or_404(separacao_id)
    
    obs_atuais = separacao.observacoes or []
    nova_obs = {
        'texto': dados.get('texto', ''),
        'autor': dados.get('autor', 'N/A'),
        'role': dados.get('role', 'N/A'),
        'timestamp': datetime.now(tz_cuiaba).isoformat()
    }
    obs_atuais.append(nova_obs)
    
    separacao.observacoes = list(obs_atuais) # Força a detecção da mudança
    db.session.commit()
    return jsonify({'status': 'success'})

@separacoes_bp.route('/ativas', methods=['GET'])
def get_separacoes_ativas():
    # --- INÍCIO DA CORREÇÃO ---
    # Pega os parâmetros da URL enviados pelo frontend
    user_role = request.args.get('user_role')
    user_name = request.args.get('user_name')

    # A query base continua a mesma
    query = Separacao.query.filter(Separacao.status.in_(['Em Separação', 'Em Conferência']))

    # Se o usuário logado for um Vendedor, adiciona um filtro extra à query
    if user_role == 'Vendedor' and user_name:
        query = query.filter_by(vendedor_nome=user_name)
    
    # Executa a query final (com ou sem o filtro de vendedor)
    ativas = query.order_by(Separacao.data_criacao.desc()).all()
    # --- FIM DA CORREÇÃO ---
    
    return jsonify([serialize_separacao(s) for s in ativas])

@separacoes_bp.route('/paginadas', methods=['POST'])
def get_separacoes_paginadas():
    dados = request.get_json()
    page = dados.get('page', 0)
    limit = dados.get('limit', 15)
    search_term = dados.get('search', '').lower().strip()
    
    # --- INÍCIO DA CORREÇÃO ---
    user_role = dados.get('user_role')
    user_name = dados.get('user_name')

    # A query base continua a mesma
    query = Separacao.query.filter_by(status='Finalizado')

    # Se o usuário for um Vendedor, adiciona o filtro
    if user_role == 'Vendedor' and user_name:
        query = query.filter_by(vendedor_nome=user_name)
    # --- FIM DA CORREÇÃO ---

    if search_term:
        search_filter = or_(
            Separacao.numero_movimentacao.ilike(f'%{search_term}%'),
            Separacao.nome_cliente.ilike(f'%{search_term}%'),
            Separacao.vendedor_nome.ilike(f'%{search_term}%'),
            Separacao.separador_nome.ilike(f'%{search_term}%')
        )
        query = query.filter(search_filter)

    pagination = query.order_by(Separacao.numero_movimentacao.desc()).paginate(page=page + 1, per_page=limit, error_out=False)
    
    return jsonify({
        'finalizadas': [serialize_separacao(s) for s in pagination.items],
        'temMais': pagination.has_next
    })

@separacoes_bp.route('/tabela-paginada', methods=['POST'])
def get_tabela_separacoes_paginada():
    dados = request.get_json()
    page = dados.get('page', 0)
    limit = dados.get('limit', 30)
    search_term = dados.get('search', '').lower().strip()

    query = Separacao.query
    if search_term:
        search_filter = or_(
            Separacao.numero_movimentacao.ilike(f'%{search_term}%'),
            Separacao.nome_cliente.ilike(f'%{search_term}%'),
            Separacao.vendedor_nome.ilike(f'%{search_term}%'),
            Separacao.separador_nome.ilike(f'%{search_term}%'),
            Separacao.conferente_nome.ilike(f'%{search_term}%')
        )
        query = query.filter(search_filter)

    pagination = query.order_by(Separacao.numero_movimentacao.desc()).paginate(page=page + 1, per_page=limit, error_out=False)
    
    return jsonify({
        'separacoes': [serialize_separacao(s) for s in pagination.items],
        'temMais': pagination.has_next
    })

def format_seconds_to_hms(seconds):
    """Converte segundos em uma string 'HH:MM:SS'."""
    if seconds is None or not isinstance(seconds, (int, float)) or seconds < 0:
        return "N/A"
    hours, remainder = divmod(seconds, 3600)
    minutes, seconds = divmod(remainder, 60)
    return f"{int(hours):02}:{int(minutes):02}:{int(seconds):02}"

@separacoes_bp.route('/dashboard-data', methods=['POST'])
def get_dashboard_logistica_data():
    filtros = request.get_json() or {}
    data_inicio_str = filtros.get('dataInicio')
    data_fim_str = filtros.get('dataFim')

    try:
        query = Separacao.query.filter_by(status='Finalizado')

        if data_inicio_str:
            query = query.filter(Separacao.data_finalizacao >= data_inicio_str)
        if data_fim_str:
            query = query.filter(Separacao.data_finalizacao <= data_fim_str + 'T23:59:59')

        separacoes_finalizadas = query.all()

        separador_stats = {}
        conferente_stats = {}
        data_corte = datetime(2025, 10, 8, 0, 0, 0, tzinfo=tz_cuiaba)

        for sep in separacoes_finalizadas:
            separador_nome = sep.separador_nome
            conferente_nome = sep.conferente_nome

            if separador_nome:
                stats = separador_stats.setdefault(separador_nome, {'count': 0, 'total_seconds': 0, 'items_for_avg': 0})
                stats['count'] += 1
                
                try:
                    data_criacao_obj = datetime.fromisoformat(sep.data_criacao) if sep.data_criacao else None
                    if data_criacao_obj and data_criacao_obj >= data_corte and sep.data_inicio_conferencia:
                        start = data_criacao_obj
                        end = datetime.fromisoformat(sep.data_inicio_conferencia)
                        duration = (end - start).total_seconds()
                        if duration >= 0:
                            stats['total_seconds'] += duration
                            stats['items_for_avg'] += 1
                except (ValueError, TypeError):
                    continue

            if conferente_nome:
                stats = conferente_stats.setdefault(conferente_nome, {'count': 0, 'total_seconds': 0, 'items_for_avg': 0})
                stats['count'] += 1

                try:
                    data_criacao_obj = datetime.fromisoformat(sep.data_criacao) if sep.data_criacao else None
                    if data_criacao_obj and data_criacao_obj >= data_corte and sep.data_inicio_conferencia and sep.data_finalizacao:
                        start = datetime.fromisoformat(sep.data_inicio_conferencia)
                        end = datetime.fromisoformat(sep.data_finalizacao)
                        duration = (end - start).total_seconds()
                        if duration >= 0:
                            stats['total_seconds'] += duration
                            stats['items_for_avg'] += 1
                except (ValueError, TypeError):
                    continue
        
        resultado_separadores = [
            {'nome': nome, 'count': data['count'], 'avg_time_str': format_seconds_to_hms(data['total_seconds'] / data['items_for_avg'] if data['items_for_avg'] > 0 else None)}
            for nome, data in separador_stats.items()
        ]
        resultado_conferentes = [
            {'nome': nome, 'count': data['count'], 'avg_time_str': format_seconds_to_hms(data['total_seconds'] / data['items_for_avg'] if data['items_for_avg'] > 0 else None)}
            for nome, data in conferente_stats.items()
        ]
            
        resultado_separadores.sort(key=lambda x: x['count'], reverse=True)
        resultado_conferentes.sort(key=lambda x: x['count'], reverse=True)

        return jsonify({
            'separadores': resultado_separadores,
            'conferentes': resultado_conferentes
        })

    except Exception as e:
        print(f"ERRO ao gerar dados do dashboard de logística: {e}")
        return jsonify({'error': str(e)}), 500
