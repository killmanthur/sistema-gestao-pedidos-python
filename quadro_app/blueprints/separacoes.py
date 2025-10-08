# quadro_app/blueprints/separacoes.py
from flask import Blueprint, request, jsonify
from datetime import datetime, timedelta
from quadro_app import db, tz_cuiaba
from quadro_app.utils import registrar_log

separacoes_bp = Blueprint('separacoes', __name__, url_prefix='/api/separacoes')

# --- FUNÇÕES AUXILIARES DA FILA (LÓGICA SIMPLIFICADA) ---
def get_todos_separadores():
    """Busca todos os usuários com a role 'Separador'."""
    try:
        users_ref = db.reference('usuarios').order_by_child('role').equal_to('Separador').get()
        if not users_ref:
            return {}
        return users_ref
    except Exception as e:
        print(f"ERRO ao buscar todos os separadores: {e}")
        return {}

def _get_fila_separadores_ativos():
    """Retorna uma lista de nomes de separadores que estão com 'ativo_na_fila' = True."""
    todos_separadores = get_todos_separadores()
    fila_ativa = []
    
    for uid, user_data in todos_separadores.items():
        if isinstance(user_data, dict) and user_data.get('ativo_na_fila') is True:
            nome = user_data.get('nome')
            if nome and nome.lower() != 'separacao':
                fila_ativa.append({
                    'nome': nome,
                    'prioridade': user_data.get('prioridade_fila', 0)
                })
    
    fila_ativa.sort(key=lambda x: (-x['prioridade'], x['nome']))
    
    return [item['nome'] for item in fila_ativa]

def _atualizar_fila_separadores(separador_designado):
    """
    Move o separador designado para o final da fila, dando a ele a menor prioridade.
    """
    try:
        todos_separadores = get_todos_separadores()
        updates = {}
        
        prioridades = [
            user.get('prioridade_fila', 0)
            for user in todos_separadores.values()
            if isinstance(user, dict)
        ]
        menor_prioridade = min(prioridades) if prioridades else 0

        for uid, user_data in todos_separadores.items():
            if isinstance(user_data, dict) and user_data.get('nome') == separador_designado:
                updates[f'usuarios/{uid}/prioridade_fila'] = menor_prioridade - 1
                break
        
        if updates:
            db.reference().update(updates)

    except Exception as e:
        print(f"ERRO ao atualizar a ordem da fila de separadores: {e}")

# --- FIM DAS FUNÇÕES DA FILA ---

@separacoes_bp.route('/status-todos-separadores', methods=['GET'])
def get_status_todos_separadores():
    """Retorna a lista de todos os separadores e seu status de atividade na fila."""
    try:
        todos_separadores = get_todos_separadores()
        resultado = []
        for uid, user_data in todos_separadores.items():
            if isinstance(user_data, dict):
                nome = user_data.get('nome')
                if nome and nome.lower() != 'separacao':
                    is_active = user_data.get('ativo_na_fila', False) 
                    resultado.append({'nome': nome, 'ativo': is_active})
        
        resultado.sort(key=lambda x: x['nome'])
        return jsonify(resultado)
    except Exception as e:
        print(f"ERRO em get_status_todos_separadores: {e}")
        return jsonify({'error': str(e)}), 500

@separacoes_bp.route('/fila-separadores', methods=['PUT'])
def atualizar_fila_e_status():
    """
    Recebe uma lista de nomes que devem estar ativos e atualiza o campo 'ativo_na_fila'.
    """
    try:
        nomes_ativos_recebidos = request.get_json()
        if not isinstance(nomes_ativos_recebidos, list):
            return jsonify({'error': 'O corpo da requisição deve ser uma lista de nomes.'}), 400

        todos_separadores = get_todos_separadores()
        updates = {}
        
        prioridades = [
            user.get('prioridade_fila', 0)
            for user in todos_separadores.values()
            if isinstance(user, dict)
        ]
        maior_prioridade = max(prioridades) if prioridades else 0

        for uid, user_data in todos_separadores.items():
            if isinstance(user_data, dict) and 'nome' in user_data:
                nome = user_data['nome']
                path_ativo = f"/usuarios/{uid}/ativo_na_fila"
                estava_ativo = user_data.get('ativo_na_fila', False)

                if nome in nomes_ativos_recebidos:
                    updates[path_ativo] = True
                    if not estava_ativo:
                        updates[f"/usuarios/{uid}/prioridade_fila"] = maior_prioridade + 1
                else:
                    updates[path_ativo] = False
        
        if updates:
            db.reference().update(updates)
            
        return jsonify({'status': 'success'})
    except Exception as e:
        print(f"ERRO em atualizar_fila_e_status: {e}")
        return jsonify({'error': str(e)}), 500

@separacoes_bp.route('/fila-separadores', methods=['GET'])
def get_fila_endpoint():
    """Retorna a lista de nomes dos separadores atualmente ativos."""
    try:
        fila_ativos = _get_fila_separadores_ativos()
        return jsonify(fila_ativos)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

def format_seconds_to_hms(seconds):
    """Converte segundos em uma string 'HH:MM:SS'."""
    if seconds is None or seconds < 0:
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
        ref = db.reference('separacoes')
        todas_separacoes = ref.order_by_child('status').equal_to('Finalizado').get() or {}

        # ****** INÍCIO DA CORREÇÃO: Data de corte para cálculo de tempo médio ******
        # Define a "data de corte". Todas as separações criadas ANTES desta data
        # serão ignoradas para o cálculo de tempo médio.
        data_corte = datetime(2025, 10, 8, 0, 0, 0, tzinfo=tz_cuiaba)
        # ****** FIM DA CORREÇÃO ******

        separacoes_filtradas = []
        for sep_id, sep_data in todas_separacoes.items():
            data_finalizacao = sep_data.get('data_finalizacao', '').split('T')[0]
            if not data_finalizacao:
                continue
            if data_inicio_str and data_finalizacao < data_inicio_str:
                continue
            if data_fim_str and data_finalizacao > data_fim_str:
                continue
            separacoes_filtradas.append(sep_data)

        separador_stats = {}
        conferente_stats = {}

        for sep in separacoes_filtradas:
            separador_nome = sep.get('separador_nome')
            conferente_nome = sep.get('conferente_nome')

            if separador_nome:
                stats = separador_stats.setdefault(separador_nome, {'count': 0, 'total_seconds': 0, 'items_for_avg': 0})
                stats['count'] += 1
                
                # ****** CORREÇÃO APLICADA AQUI ******
                # Converte a data de criação para um objeto datetime ciente do fuso horário
                data_criacao_obj = datetime.fromisoformat(sep['data_criacao']) if sep.get('data_criacao') else None

                # Só calcula o tempo se a data de criação for POSTERIOR à data de corte
                if data_criacao_obj and data_criacao_obj >= data_corte and sep.get('data_inicio_conferencia'):
                    start = data_criacao_obj
                    end = datetime.fromisoformat(sep['data_inicio_conferencia'])
                    duration = (end - start).total_seconds()
                    if duration >= 0:
                        stats['total_seconds'] += duration
                        stats['items_for_avg'] += 1

            if conferente_nome:
                stats = conferente_stats.setdefault(conferente_nome, {'count': 0, 'total_seconds': 0, 'items_for_avg': 0})
                stats['count'] += 1

                # ****** CORREÇÃO APLICADA AQUI ******
                data_criacao_obj = datetime.fromisoformat(sep['data_criacao']) if sep.get('data_criacao') else None
                
                # Só calcula o tempo se a data de criação for POSTERIOR à data de corte
                if data_criacao_obj and data_criacao_obj >= data_corte and sep.get('data_inicio_conferencia') and sep.get('data_finalizacao'):
                    start = datetime.fromisoformat(sep['data_inicio_conferencia'])
                    end = datetime.fromisoformat(sep['data_finalizacao'])
                    duration = (end - start).total_seconds()
                    if duration >= 0:
                        stats['total_seconds'] += duration
                        stats['items_for_avg'] += 1
        
        conferente_stats.pop('expedicao', None)
        
        resultado_separadores = []
        for nome, data in separador_stats.items():
            avg_seconds = data['total_seconds'] / data['items_for_avg'] if data['items_for_avg'] > 0 else None
            resultado_separadores.append({
                'nome': nome,
                'count': data['count'],
                'avg_time_str': format_seconds_to_hms(avg_seconds)
            })

        resultado_conferentes = []
        for nome, data in conferente_stats.items():
            avg_seconds = data['total_seconds'] / data['items_for_avg'] if data['items_for_avg'] > 0 else None
            resultado_conferentes.append({
                'nome': nome,
                'count': data['count'],
                'avg_time_str': format_seconds_to_hms(avg_seconds)
            })
            
        resultado_separadores.sort(key=lambda x: x['count'], reverse=True)
        resultado_conferentes.sort(key=lambda x: x['count'], reverse=True)

        return jsonify({
            'separadores': resultado_separadores,
            'conferentes': resultado_conferentes
        })

    except Exception as e:
        print(f"ERRO ao gerar dados do dashboard de logística: {e}")
        return jsonify({'error': str(e)}), 500

def criar_notificacao_separacao(destinatario_nome, mensagem, autor_nome):
    try:
        usuarios_ref = db.reference('usuarios')
        destinatario_query = usuarios_ref.order_by_child('nome').equal_to(destinatario_nome).get()
        if not destinatario_query: return
        destinatario_uid = list(destinatario_query.keys())[0]
        notificacao_ref = db.reference(f'notificacoes_separacao/{destinatario_uid}')
        notificacao_ref.push({
            'mensagem': mensagem,
            'lida': False,
            'timestamp': datetime.now(tz_cuiaba).isoformat(),
            'autor': autor_nome
        })
    except Exception as e:
        print(f"ERRO ao criar notificação: {e}")

@separacoes_bp.route('', methods=['POST'])
def criar_separacao():
    dados = request.get_json()
    editor_nome = dados.get('editor_nome', 'Sistema')
    num_movimentacao = dados.get('numero_movimentacao')
    vendedor_nome = dados.get('vendedor_nome')
    separador_nome = dados.get('separador_nome')
    
    try:
        if not num_movimentacao or len(str(num_movimentacao)) != 6:
            return jsonify({'error': 'O Nº de Movimentação deve ter exatamente 6 dígitos.'}), 400

        separacoes_ref = db.reference('separacoes')
        existente = separacoes_ref.order_by_child('numero_movimentacao').equal_to(num_movimentacao).get()
        if existente:
            return jsonify({'error': f'O número de movimentação {num_movimentacao} já existe.'}), 409

        nova_separacao = {
            'numero_movimentacao': num_movimentacao,
            'nome_cliente': dados.get('nome_cliente'),
            'separador_nome': separador_nome,
            'vendedor_nome': vendedor_nome,
            'status': 'Em Separação',
            'data_criacao': datetime.now(tz_cuiaba).isoformat(),
            'data_inicio_conferencia': None,
            'data_finalizacao': None,
            'conferente_nome': ''
        }
        
        nova_ref = separacoes_ref.push(nova_separacao)
        _atualizar_fila_separadores(separador_nome)
        
        mensagem = f"Nova separação (Mov: {num_movimentacao}) criada para você por {editor_nome}."
        criar_notificacao_separacao(vendedor_nome, mensagem, editor_nome)
        
        mensagem_log = f"Criou a separação para o cliente '{dados.get('nome_cliente')}'."
        registrar_log(nova_ref.key, editor_nome, 'CRIAÇÃO', detalhes={'info': mensagem_log}, log_type='separacoes')
        
        return jsonify({'status': 'success', 'id': nova_ref.key}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@separacoes_bp.route('/<string:separacao_id>', methods=['PUT'])
def editar_separacao(separacao_id):
    dados = request.get_json()
    editor_nome = dados.pop('editor_nome', 'N/A')
    num_movimentacao = dados.get('numero_movimentacao')
    
    try:
        if num_movimentacao and len(str(num_movimentacao)) != 6:
             return jsonify({'error': 'O Nº de Movimentação deve ter exatamente 6 dígitos.'}), 400

        ref = db.reference(f'separacoes/{separacao_id}')
        
        separacao_antiga = ref.get()
        if not separacao_antiga:
            return jsonify({'error': 'Separação não encontrada'}), 404
        
        if num_movimentacao and str(separacao_antiga.get('numero_movimentacao')) != str(num_movimentacao):
            separacoes_ref = db.reference('separacoes')
            existente = separacoes_ref.order_by_child('numero_movimentacao').equal_to(num_movimentacao).get()
            if existente:
                ids_existentes = list(existente.keys())
                if ids_existentes[0] != separacao_id:
                     return jsonify({'error': f'O número de movimentação {num_movimentacao} já pertence a outra separação.'}), 409

        if 'conferente_nome' in dados and dados.get('conferente_nome'):
            if separacao_antiga.get('status') == 'Em Separação':
                dados['status'] = 'Em Conferência'
                dados['data_inicio_conferencia'] = datetime.now(tz_cuiaba).isoformat()

        ref.update(dados)

        vendedor_nome = separacao_antiga.get('vendedor_nome')
        if vendedor_nome:
            mensagem = f"A separação (Mov: {separacao_antiga.get('numero_movimentacao')}) foi editada por {editor_nome}."
            criar_notificacao_separacao(vendedor_nome, mensagem, editor_nome)

        alteracoes = []
        campos_ignorados = ['status'] 
        for chave, valor_novo in dados.items():
            if chave in campos_ignorados: continue
            
            valor_antigo = separacao_antiga.get(chave, '')
            if str(valor_antigo) != str(valor_novo):
                alteracoes.append(f"alterou '{chave}' de '{valor_antigo or 'Nenhum'}' para '{valor_novo or 'Nenhum'}'")
        
        if alteracoes:
            mensagem_log = f"Editou a separação: {', '.join(alteracoes)}."
            registrar_log(separacao_id, editor_nome, 'EDIÇÃO', detalhes={'info': mensagem_log}, log_type='separacoes')
        
        return jsonify({'status': 'success'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@separacoes_bp.route('/paginadas', methods=['POST'])
def get_separacoes_paginadas():
    try:
        dados = request.get_json()
        page = dados.get('page', 0)
        limit = dados.get('limit', 15)
        search_term = dados.get('search', '').lower().strip()
        user_role = dados.get('user_role')
        user_name = dados.get('user_name')
        offset = page * limit

        snapshot = db.reference('separacoes').get() or {}
        todas_separacoes = [{'id': key, **value} for key, value in snapshot.items()]

        if user_role == 'Vendedor':
            todas_separacoes = [s for s in todas_separacoes if s.get('vendedor_nome') == user_name]

        def safe_int_convert(value):
            try:
                return int(str(value))
            except (ValueError, TypeError):
                return 0

        finalizadas = sorted(
            [s for s in todas_separacoes if s.get('status') == 'Finalizado'], 
            key=lambda x: safe_int_convert(x.get('numero_movimentacao')), 
            reverse=True
        )
        
        if search_term:
            def check_search(s):
                return (search_term in str(s.get('numero_movimentacao', '')).lower() or
                        search_term in str(s.get('nome_cliente', '')).lower() or
                        search_term in str(s.get('vendedor_nome', '')).lower() or
                        search_term in str(s.get('separador_nome', '')).lower())
            
            finalizadas = [s for s in finalizadas if check_search(s)]

        finalizadas_paginadas = finalizadas[offset : offset + limit]
        tem_mais = (offset + limit) < len(finalizadas)

        resultado = {
            'finalizadas': finalizadas_paginadas,
            'temMais': tem_mais
        }
        return jsonify(resultado)

    except Exception as e:
        print(f"ERRO em get_separacoes_paginadas: {e}")
        return jsonify({'error': str(e)}), 500

@separacoes_bp.route('/<string:separacao_id>/observacao', methods=['POST'])
def adicionar_observacao(separacao_id):
    dados = request.get_json()
    autor_nome = dados.get('autor', 'N/A')
    autor_role = dados.get('role', 'N/A')
    
    try:
        separacao_ref = db.reference(f'separacoes/{separacao_id}')
        separacao_atual = separacao_ref.get()
        if not separacao_atual:
            return jsonify({'error': 'Separação não encontrada.'}), 404

        obs_ref = separacao_ref.child('observacoes')
        nova_observacao = {
            'texto': dados.get('texto', ''),
            'autor': autor_nome,
            'role': autor_role,
            'timestamp': datetime.now(tz_cuiaba).isoformat()
        }
        obs_ref.push(nova_observacao)
        
        vendedor_nome = separacao_atual.get('vendedor_nome')
        num_mov = separacao_atual.get('numero_movimentacao')
        
        if vendedor_nome:
            mensagem_vendedor = f"{autor_nome} adicionou uma observação na separação (Mov: {num_mov})."
            criar_notificacao_separacao(vendedor_nome, mensagem_vendedor, autor_nome)
        
        if autor_role == 'Vendedor':
            usuarios_ref = db.reference('usuarios')
            expedicao_users = usuarios_ref.order_by_child('role').equal_to('Expedição').get()
            if expedicao_users:
                mensagem_expedicao = f"O vendedor {autor_nome} adicionou uma observação na separação (Mov: {num_mov})."
                for user_data in expedicao_users.values():
                    if user_data and user_data.get('nome'):
                        criar_notificacao_separacao(user_data['nome'], mensagem_expedicao, autor_nome)
        
        registrar_log(separacao_id, autor_nome, 'NOVA OBSERVAÇÃO', detalhes={'info': dados.get('texto')}, log_type='separacoes')
        return jsonify({'status': 'success'}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@separacoes_bp.route('/notificacoes', methods=['DELETE'])
def limpar_notificacoes():
    from firebase_admin import auth
    id_token = request.headers.get('Authorization', '').split('Bearer ')[-1]
    if not id_token:
        return jsonify({"error": "Token de autorização ausente."}), 401
    try:
        decoded_token = auth.verify_id_token(id_token)
        uid = decoded_token['uid']
        
        db.reference(f'notificacoes_separacao/{uid}').delete()
        
        return jsonify({'status': 'success'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@separacoes_bp.route('/<string:separacao_id>', methods=['DELETE'])
def deletar_separacao(separacao_id):
    dados = request.get_json()
    editor_nome = dados.get('editor_nome', 'N/A')
    try:
        ref = db.reference(f'separacoes/{separacao_id}')
        separacao = ref.get()
        if not separacao:
            return jsonify({'error': 'Separação não encontrada.'}), 404
            
        movimentacao = separacao.get('numero_movimentacao', 'N/A')
        mensagem_log = f"Excluiu a separação (Mov: {movimentacao})."
        registrar_log(separacao_id, editor_nome, 'EXCLUSÃO', detalhes={'info': mensagem_log}, log_type='separacoes')
        
        ref.delete()
        db.reference(f'logs_separacoes/{separacao_id}').delete()
        return jsonify({'status': 'success'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@separacoes_bp.route('/<string:separacao_id>/status', methods=['PUT'])
def atualizar_status_separacao(separacao_id):
    dados = request.get_json()
    novo_status = dados.get('status')
    editor_nome = dados.get('editor_nome', 'N/A')
    try:
        ref = db.reference(f'separacoes/{separacao_id}')
        
        separacao_antiga = ref.get()
        if not separacao_antiga:
            return jsonify({'error': 'Separação não encontrada'}), 404
        status_antigo = separacao_antiga.get('status', 'N/A')

        updates = {'status': novo_status}
        if novo_status == 'Finalizado':
            updates['data_finalizacao'] = datetime.now(tz_cuiaba).isoformat()
        
        ref.update(updates)

        detalhes = {'de': status_antigo, 'para': novo_status}
        registrar_log(separacao_id, editor_nome, 'MUDANÇA DE STATUS', detalhes=detalhes, log_type='separacoes')

        return jsonify({'status': 'success'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@separacoes_bp.route('/tabela-paginada', methods=['POST'])
def get_tabela_separacoes_paginada():
    try:
        dados = request.get_json()
        page = dados.get('page', 0)
        limit = dados.get('limit', 30)
        search_term = dados.get('search', '').lower().strip()
        offset = page * limit

        separacoes_ref = db.reference('separacoes')
        snapshot = separacoes_ref.get() or {}
        
        lista_separacoes = [{'id': key, **value} for key, value in snapshot.items()]
        
        def safe_int_convert(value):
            try:
                return int(value)
            except (ValueError, TypeError):
                return 0

        lista_separacoes.sort(key=lambda x: safe_int_convert(x.get('numero_movimentacao')), reverse=True)
        
        separacoes_filtradas = []
        if search_term:
             for s in lista_separacoes:
                if any(search_term in str(val).lower() for val in s.values()):
                    separacoes_filtradas.append(s)
        else:
            separacoes_filtradas = lista_separacoes

        itens_da_pagina = separacoes_filtradas[offset : offset + limit]
        tem_mais = (offset + limit) < len(separacoes_filtradas)
        
        return jsonify({'separacoes': itens_da_pagina, 'temMais': tem_mais})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@separacoes_bp.route('/ativas', methods=['GET'])
def get_separacoes_ativas():
    """Retorna separações com status 'Em Separação' ou 'Em Conferência' (OTIMIZADO)."""
    try:
        user_role = request.args.get('user_role')
        user_name = request.args.get('user_name')
        ref = db.reference('separacoes')

        # Queries separadas e eficientes
        em_separacao = ref.order_by_child('status').equal_to('Em Separação').get() or {}
        em_conferencia = ref.order_by_child('status').equal_to('Em Conferência').get() or {}

        # Combina os resultados
        todas_ativas_dict = {**em_separacao, **em_conferencia}

        separacoes_ativas = [{'id': key, **value} for key, value in todas_ativas_dict.items()]

        if user_role == 'Vendedor' and user_name:
            separacoes_ativas = [s for s in separacoes_ativas if s.get('vendedor_nome') == user_name]

        separacoes_ativas.sort(key=lambda x: int(x.get('numero_movimentacao', 0)), reverse=True)
        return jsonify(separacoes_ativas)
    except Exception as e:
        return jsonify({'error': str(e)}), 500