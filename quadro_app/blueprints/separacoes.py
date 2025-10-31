# quadro_app/blueprints/separacoes.py
from flask import Blueprint, request, jsonify
from datetime import datetime
from sqlalchemy import or_, func, and_
from ..extensions import db, tz_cuiaba
from quadro_app.models import Separacao, Usuario, ItemExcluido, ListaDinamica
from quadro_app.utils import registrar_log

separacoes_bp = Blueprint('separacoes', __name__, url_prefix='/api/separacoes')

@separacoes_bp.route('/fila-separadores', methods=['GET'])
def get_fila_endpoint():
    try:
        lista_fila = ListaDinamica.query.filter_by(nome='fila_separacao').first()
        if not lista_fila or not lista_fila.itens:
            return jsonify([])
        return jsonify(lista_fila.itens)
    except Exception as e:
        print(f"ERRO em get_fila_endpoint: {e}")
        return jsonify({'error': str(e)}), 500

@separacoes_bp.route('/status-todos-separadores', methods=['GET'])
def get_status_todos_separadores():
    try:
        lista_mestre_db = ListaDinamica.query.filter_by(nome='separadores').first()
        todos_os_nomes_possiveis = sorted(lista_mestre_db.itens if lista_mestre_db and lista_mestre_db.itens else [])
        lista_fila_db = ListaDinamica.query.filter_by(nome='fila_separacao').first()
        nomes_na_fila_atual = set(lista_fila_db.itens if lista_fila_db and lista_fila_db.itens else [])
        resultado = [
            {'nome': nome, 'ativo': nome in nomes_na_fila_atual}
            for nome in todos_os_nomes_possiveis
        ]
        if not resultado:
            return jsonify([])
        return jsonify(resultado)
    except Exception as e:
        print(f"ERRO em get_status_todos_separadores: {e}")
        return jsonify({'error': str(e)}), 500

@separacoes_bp.route('/fila-separadores', methods=['PUT'])
def atualizar_fila_e_status():
    try:
        nomes_ativos_recebidos = request.get_json()
        if not isinstance(nomes_ativos_recebidos, list):
            return jsonify({'error': 'O corpo da requisição deve ser uma lista de nomes.'}), 400
        
        nomes_ativos_set = set(nomes_ativos_recebidos)
        lista_fila = ListaDinamica.query.filter_by(nome='fila_separacao').first()
        if not lista_fila:
            lista_fila = ListaDinamica(nome='fila_separacao')
            db.session.add(lista_fila)
        itens_atuais_set = set(lista_fila.itens or [])
        separadores_novos = list(nomes_ativos_set - itens_atuais_set)
        separadores_antigos_mantidos = [nome for nome in (lista_fila.itens or []) if nome in nomes_ativos_set]
        nova_fila_ordenada = sorted(separadores_novos) + separadores_antigos_mantidos
        lista_fila.itens = nova_fila_ordenada
        db.session.commit()
        return jsonify({'status': 'success', 'nova_fila': nova_fila_ordenada})
    except Exception as e:
        db.session.rollback()
        print(f"ERRO ao atualizar fila de separadores: {e}")
        return jsonify({'error': str(e)}), 500

def serialize_separacao(s):
    return {
        'id': s.id, 'numero_movimentacao': s.numero_movimentacao, 'nome_cliente': s.nome_cliente,
        'separadores_nomes': s.separadores_nomes,
        'vendedor_nome': s.vendedor_nome, 'status': s.status,
        'data_criacao': s.data_criacao, 'data_inicio_conferencia': s.data_inicio_conferencia,
        'data_finalizacao': s.data_finalizacao, 'conferente_nome': s.conferente_nome,
        'observacoes': s.observacoes, 'qtd_pecas': s.qtd_pecas
    }

@separacoes_bp.route('', methods=['POST'])
def criar_separacao():
    dados = request.get_json()
    editor_nome = dados.get('editor_nome', 'Sistema')
    num_mov = dados.get('numero_movimentacao')
    separadores_nomes = dados.get('separadores_nomes')
    if not num_mov or len(str(num_mov)) != 6:
        return jsonify({'error': 'O Nº de Movimentação deve ter exatamente 6 dígitos.'}), 400
    if not separadores_nomes or not isinstance(separadores_nomes, list) or len(separadores_nomes) == 0:
        return jsonify({'error': 'Selecione pelo menos um separador.'}), 400
    existente = Separacao.query.filter_by(numero_movimentacao=num_mov).first()
    if existente:
        return jsonify({'error': f'O número de movimentação {num_mov} já existe.'}), 409
    nova_separacao = Separacao(
        numero_movimentacao=num_mov, nome_cliente=dados.get('nome_cliente'),
        separadores_nomes=separadores_nomes, vendedor_nome=dados.get('vendedor_nome'),
        qtd_pecas=dados.get('qtd_pecas'), status='Em Separação',
        data_criacao=datetime.now(tz_cuiaba).isoformat(),
    )
    db.session.add(nova_separacao)
    db.session.commit()
    if separadores_nomes:
        try:
            lista_fila = ListaDinamica.query.filter_by(nome='fila_separacao').first()
            if lista_fila and lista_fila.itens:
                itens_fila = lista_fila.itens[:]
                itens_fila_filtrada = [nome for nome in itens_fila if nome not in separadores_nomes]
                lista_fila.itens = itens_fila_filtrada + sorted(separadores_nomes)
                db.session.commit()
        except Exception as e:
            db.session.rollback()
            print(f"ERRO ao rotacionar a fila de separadores: {e}")
    log_details = {
        'cliente': nova_separacao.nome_cliente, 'vendedor': nova_separacao.vendedor_nome,
        'separadores': ", ".join(nova_separacao.separadores_nomes), 'peças': nova_separacao.qtd_pecas
    }
    registrar_log(nova_separacao.id, editor_nome, 'CRIACAO', detalhes=log_details, log_type='separacoes')
    return jsonify({'status': 'success', 'id': nova_separacao.id}), 201

@separacoes_bp.route('/<int:separacao_id>', methods=['PUT'])
def editar_separacao(separacao_id):
    dados = request.get_json()
    separacao = Separacao.query.get_or_404(separacao_id)
    editor_nome = dados.pop('editor_nome', 'Sistema')
    estado_antigo = {field: getattr(separacao, field) for field in serialize_separacao(separacao).keys()}
    for key, value in dados.items():
        if hasattr(separacao, key):
            setattr(separacao, key, value)
    if dados.get('conferente_nome') and estado_antigo['status'] == 'Em Separação':
        separacao.status = 'Em Conferência'
        separacao.data_inicio_conferencia = datetime.now(tz_cuiaba).isoformat()
    db.session.commit()
    detalhes_log = {}
    for key, old_value in estado_antigo.items():
        new_value = getattr(separacao, key)
        if key in ['id', 'observacoes', 'data_criacao', 'data_inicio_conferencia', 'data_finalizacao']: continue
        if str(old_value) != str(new_value):
            detalhes_log[key] = {'de': old_value or 'N/A', 'para': new_value or 'N/A'}
    if detalhes_log:
        registrar_log(separacao_id, editor_nome, 'EDICAO', detalhes=detalhes_log, log_type='separacoes')
    return jsonify({'status': 'success'})

@separacoes_bp.route('/<int:separacao_id>', methods=['DELETE'])
def deletar_separacao(separacao_id):
    editor_nome = request.json.get('editor_nome', 'Sistema')
    separacao = Separacao.query.get_or_404(separacao_id)
    item_excluido = ItemExcluido(
        tipo_item='Separacao', item_id_original=str(separacao.id),
        dados_item=serialize_separacao(separacao), excluido_por=editor_nome,
        data_exclusao=datetime.now(tz_cuiaba).isoformat()
    )
    db.session.add(item_excluido)
    registrar_log(
        separacao_id, editor_nome, 'EXCLUSAO', 
        detalhes={'info': f"Mov. {separacao.numero_movimentacao} para '{separacao.nome_cliente}' foi movido para a lixeira."}, 
        log_type='separacoes'
    )
    db.session.delete(separacao)
    db.session.commit()
    return jsonify({'status': 'success'})

@separacoes_bp.route('/<int:separacao_id>/status', methods=['PUT'])
def atualizar_status_separacao(separacao_id):
    dados = request.get_json()
    novo_status = dados.get('status')
    editor_nome = dados.get('editor_nome', 'Sistema')
    separacao = Separacao.query.get_or_404(separacao_id)
    status_antigo = separacao.status
    separacao.status = novo_status
    if novo_status == 'Finalizado':
        separacao.data_finalizacao = datetime.now(tz_cuiaba).isoformat()
    db.session.commit()
    registrar_log(separacao_id, editor_nome, 'STATUS_ALTERADO', detalhes={'de': status_antigo, 'para': novo_status}, log_type='separacoes')
    return jsonify({'status': 'success'})

@separacoes_bp.route('/<int:separacao_id>/observacao', methods=['POST'])
def adicionar_observacao(separacao_id):
    dados = request.get_json()
    autor, texto = dados.get('autor', 'N/A'), dados.get('texto', '')
    separacao = Separacao.query.get_or_404(separacao_id)
    obs_atuais = separacao.observacoes or []
    nova_obs = {
        'texto': texto, 'autor': autor, 'role': dados.get('role', 'N/A'),
        'timestamp': datetime.now(tz_cuiaba).isoformat()
    }
    obs_atuais.append(nova_obs)
    separacao.observacoes = list(obs_atuais)
    db.session.commit()
    registrar_log(separacao_id, autor, 'OBSERVACAO_ADICIONADA', detalhes={'info': texto}, log_type='separacoes')
    return jsonify({'status': 'success'})

@separacoes_bp.route('/ativas', methods=['GET'])
def get_separacoes_ativas():
    user_role = request.args.get('user_role')
    user_name = request.args.get('user_name')
    query = Separacao.query.filter(Separacao.status.in_(['Em Separação', 'Em Conferência']))
    if user_role == 'Vendedor' and user_name:
        query = query.filter_by(vendedor_nome=user_name)
    ativas = query.order_by(Separacao.data_criacao.desc()).all()
    return jsonify([serialize_separacao(s) for s in ativas])

@separacoes_bp.route('/status-ativas', methods=['GET'])
def get_status_separacoes_ativas():
    try:
        query = Separacao.query.filter(Separacao.status.in_(['Em Separação', 'Em Conferência']))
        count = query.count()
        latest_creation_obj = db.session.query(func.max(Separacao.data_criacao)).filter(Separacao.status.in_(['Em Separação', 'Em Conferência'])).first()
        latest_creation = latest_creation_obj[0] if latest_creation_obj and latest_creation_obj[0] else None
        latest_conference_start_obj = db.session.query(func.max(Separacao.data_inicio_conferencia)).filter(Separacao.status == 'Em Conferência').first()
        latest_conference_start = latest_conference_start_obj[0] if latest_conference_start_obj and latest_conference_start_obj[0] else None
        updates = list(filter(None, [latest_creation, latest_conference_start]))
        latest_update = max(updates) if updates else None
        return jsonify({'total_ativas': count, 'ultimo_update': latest_update})
    except Exception as e:
        print(f"ERRO CRÍTICO na rota /status-ativas: {e}")
        return jsonify({'error': str(e)}), 500

@separacoes_bp.route('/paginadas', methods=['POST'])
def get_separacoes_paginadas():
    dados = request.get_json()
    page, limit = dados.get('page', 0), dados.get('limit', 15)
    search_term = dados.get('search', '').lower().strip()
    user_role, user_name = dados.get('user_role'), dados.get('user_name')
    query = Separacao.query.filter_by(status='Finalizado')
    if user_role == 'Vendedor' and user_name:
        query = query.filter_by(vendedor_nome=user_name)
    if search_term:
        search_filter = or_(
            Separacao.numero_movimentacao.ilike(f'%{search_term}%'),
            Separacao.nome_cliente.ilike(f'%{search_term}%'),
            Separacao.vendedor_nome.ilike(f'%{search_term}%'),
            Separacao.separadores_nomes.cast(db.String).ilike(f'%{search_term}%')
        )
        query = query.filter(search_filter)
    pagination = query.order_by(Separacao.numero_movimentacao.desc()).paginate(page=page + 1, per_page=limit, error_out=False)
    return jsonify({'finalizadas': [serialize_separacao(s) for s in pagination.items], 'temMais': pagination.has_next})

@separacoes_bp.route('/tabela-paginada', methods=['POST'])
def get_tabela_separacoes_paginada():
    dados = request.get_json()
    page, limit = dados.get('page', 0), dados.get('limit', 30)
    search_term = dados.get('search', '').lower().strip()
    query = Separacao.query
    if search_term:
        search_filter = or_(
            Separacao.numero_movimentacao.ilike(f'%{search_term}%'),
            Separacao.nome_cliente.ilike(f'%{search_term}%'),
            Separacao.vendedor_nome.ilike(f'%{search_term}%'),
            Separacao.separadores_nomes.cast(db.String).ilike(f'%{search_term}%'),
            Separacao.conferente_nome.ilike(f'%{search_term}%')
        )
        query = query.filter(search_filter)
    pagination = query.order_by(Separacao.numero_movimentacao.desc()).paginate(page=page + 1, per_page=limit, error_out=False)
    return jsonify({'separacoes': [serialize_separacao(s) for s in pagination.items], 'temMais': pagination.has_next})

def format_seconds_to_hms(seconds):
    """Formata segundos para uma string HH:MM."""
    if seconds is None or not isinstance(seconds, (int, float)) or seconds < 0:
        return "N/A"
    hours, remainder = divmod(seconds, 3600)
    minutes, _ = divmod(remainder, 60)
    return f"{int(hours):02}:{int(minutes):02}"

@separacoes_bp.route('/dashboard-data', methods=['POST'])
def get_dashboard_logistica_data():
    filtros = request.get_json() or {}
    data_inicio_str = filtros.get('dataInicio')
    data_fim_str = filtros.get('dataFim')

    try:
        ids_excluidos_query = db.session.query(ItemExcluido.item_id_original).filter_by(tipo_item='Separacao')
        ids_excluidos = {str(item_id[0]) for item_id in ids_excluidos_query.all()}
        query = Separacao.query.filter_by(status='Finalizado')
        if ids_excluidos:
            query = query.filter(db.cast(Separacao.id, db.String).notin_(ids_excluidos))
        if data_inicio_str:
            query = query.filter(Separacao.data_finalizacao >= data_inicio_str)
        if data_fim_str:
            query = query.filter(Separacao.data_finalizacao <= data_fim_str + 'T23:59:59')
        separacoes_finalizadas = query.all()
        
        separador_stats = {}
        conferente_stats = {}
        data_corte = datetime(2024, 1, 1, 0, 0, 0, tzinfo=tz_cuiaba)

        for sep in separacoes_finalizadas:
            lista_separadores = sep.separadores_nomes or []
            num_separadores = len(lista_separadores)

            if num_separadores > 0:
                # --- INÍCIO DA CORREÇÃO DA LÓGICA DE CÁLCULO ---
                total_pecas_tarefa = sep.qtd_pecas or 0
                
                # Usa divisão de inteiros para obter a base
                base_pecas = total_pecas_tarefa // num_separadores
                # Usa o operador de módulo para obter o resto
                resto_pecas = total_pecas_tarefa % num_separadores
                
                # Cria uma lista com a distribuição base para cada separador
                distribuicao = [base_pecas] * num_separadores
                
                # Distribui o resto, 1 peça de cada vez, para os primeiros separadores da lista
                for i in range(resto_pecas):
                    distribuicao[i] += 1
                
                # Itera sobre a lista de separadores e a lista de distribuição ao mesmo tempo
                for i, nome_separador in enumerate(lista_separadores):
                    stats = separador_stats.setdefault(nome_separador, {'count': 0, 'total_seconds': 0, 'items_for_avg': 0, 'total_pecas': 0})
                    
                    stats['count'] += 1
                    # Adiciona a quantidade de peças corretamente calculada para este separador
                    stats['total_pecas'] += distribuicao[i]
                # --- FIM DA CORREÇÃO DA LÓGICA DE CÁLCULO ---
                    
                    try:
                        if sep.data_criacao and sep.data_inicio_conferencia:
                            data_criacao_obj = datetime.fromisoformat(sep.data_criacao)
                            if data_criacao_obj >= data_corte:
                                start = data_criacao_obj
                                end = datetime.fromisoformat(sep.data_inicio_conferencia)
                                duration = (end - start).total_seconds()
                                if duration >= 0:
                                    stats['total_seconds'] += duration
                                    stats['items_for_avg'] += 1
                    except (ValueError, TypeError):
                        continue

            conferente_nome = sep.conferente_nome
            if conferente_nome:
                stats = conferente_stats.setdefault(conferente_nome, {'count': 0, 'total_seconds': 0, 'items_for_avg': 0, 'total_pecas': 0})
                stats['count'] += 1
                stats['total_pecas'] += sep.qtd_pecas or 0
                try:
                    if sep.data_inicio_conferencia and sep.data_finalizacao:
                        data_inicio_obj = datetime.fromisoformat(sep.data_inicio_conferencia)
                        if data_inicio_obj >= data_corte:
                            start = data_inicio_obj
                            end = datetime.fromisoformat(sep.data_finalizacao)
                            duration = (end - start).total_seconds()
                            if duration >= 0:
                                stats['total_seconds'] += duration
                                stats['items_for_avg'] += 1
                except (ValueError, TypeError):
                    continue
        
        # O arredondamento agora não é mais estritamente necessário para as peças do separador,
        # mas não causa mal, pois já estamos trabalhando com inteiros.
        for _, data in separador_stats.items():
            data['total_pecas'] = round(data['total_pecas'])

        resultado_separadores = sorted([
            {'nome': nome, 'count': data['count'], 'total_pecas': data['total_pecas'], 'avg_time_str': format_seconds_to_hms(data['total_seconds'] / data['items_for_avg'] if data['items_for_avg'] > 0 else None)}
            for nome, data in separador_stats.items()
        ], key=lambda x: x['count'], reverse=True)
        
        resultado_conferentes = sorted([
            {'nome': nome, 'count': data['count'], 'total_pecas': data['total_pecas'], 'avg_time_str': format_seconds_to_hms(data['total_seconds'] / data['items_for_avg'] if data['items_for_avg'] > 0 else None)}
            for nome, data in conferente_stats.items()
        ], key=lambda x: x['count'], reverse=True)

        return jsonify({
            'separadores': resultado_separadores,
            'conferentes': resultado_conferentes
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500