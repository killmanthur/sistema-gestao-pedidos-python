# quadro_app/blueprints/separacoes.py
from flask import Blueprint, request, jsonify
from datetime import datetime
from quadro_app import db, tz_cuiaba
from quadro_app.utils import registrar_log

separacoes_bp = Blueprint('separacoes', __name__, url_prefix='/api/separacoes')

# --- FUNÇÕES AUXILIARES DA FILA (LÓGICA CORRIGIDA) ---

FILA_PATH = 'configuracoes/fila_separadores'

def _get_fila_separadores():
    """
    MUDANÇA: Busca a fila de separadores *ativos* que foi definida pelo usuário
    no modal "Gerenciar Fila".
    Se a configuração não existir, cria uma inicial com todos os separadores como ativos.
    """
    try:
        config = db.reference(FILA_PATH).get()

        # Cenário 1: A configuração existe e está no formato novo {'ativos': [...]}
        if config and isinstance(config, dict) and 'ativos' in config:
            return config.get('ativos', [])

        # Cenário 2 (Fallback): A configuração não existe ou está em um formato antigo.
        # Vamos criar/recriar a configuração inicial para garantir a consistência.
        todos_separadores_ref = db.reference('usuarios').order_by_child('role').equal_to('Separador').get()
        if not todos_separadores_ref:
            db.reference(FILA_PATH).set({'ativos': [], 'inativos': []})
            return []
        
        # Gera a lista inicial de separadores ativos (todos, exceto 'separacao')
        nomes_ativos_iniciais = sorted([
            user['nome'] for user in todos_separadores_ref.values() 
            if user.get('nome', '').lower() != 'separacao'
        ])
        
        # Salva a configuração inicial no formato correto e a retorna
        db.reference(FILA_PATH).set({'ativos': nomes_ativos_iniciais, 'inativos': []})
        return nomes_ativos_iniciais
        
    except Exception as e:
        print(f"ERRO ao obter fila de separadores: {e}")
        return []

def _atualizar_fila_separadores(separador_designado):
    """Move o separador designado para o final da fila de ativos."""
    try:
        fila_atual_ativos = _get_fila_separadores()
        if separador_designado in fila_atual_ativos:
            fila_atual_ativos.remove(separador_designado)
            fila_atual_ativos.append(separador_designado)
            
            # Atualiza apenas a lista de ativos, mantendo os inativos
            db.reference(f'{FILA_PATH}/ativos').set(fila_atual_ativos)
    except Exception as e:
        print(f"ERRO ao atualizar fila de separadores: {e}")

# --- FIM DAS FUNÇÕES DA FILA ---


def criar_notificacao_separacao(destinatario_nome, mensagem, autor_nome):
    # ... (código existente sem alterações)
    try:
        usuarios_ref = db.reference('usuarios')
        destinatario_query = usuarios_ref.order_by_child('nome').equal_to(destinatario_nome).get()
        if not destinatario_query:
            print(f"AVISO: Destinatário de notificação '{destinatario_nome}' não encontrado.")
            return

        destinatario_uid = list(destinatario_query.keys())[0]
        notificacao_ref = db.reference(f'notificacoes_separacao/{destinatario_uid}')
        
        notificacao_ref.push({
            'mensagem': mensagem,
            'lida': False,
            'timestamp': datetime.now(tz_cuiaba).isoformat(),
            'autor': autor_nome
        })
    except Exception as e:
        print(f"ERRO ao criar notificação para '{destinatario_nome}': {e}")


@separacoes_bp.route('/paginadas', methods=['POST'])
def get_separacoes_paginadas():
    # ... (código existente sem alterações)
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

        finalizadas = sorted([s for s in todas_separacoes if s.get('status') == 'Finalizado'], key=lambda x: x.get('data_finalizacao') or x.get('data_criacao'), reverse=True)
        
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


@separacoes_bp.route('', methods=['POST'])
def criar_separacao():
    # ... (código existente sem alterações)
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
    # ... (código existente sem alterações)
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


@separacoes_bp.route('/<string:separacao_id>/observacao', methods=['POST'])
def adicionar_observacao(separacao_id):
    # ... (código existente sem alterações)
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
                    criar_notificacao_separacao(user_data['nome'], mensagem_expedicao, autor_nome)
        
        registrar_log(separacao_id, autor_nome, 'NOVA OBSERVAÇÃO', detalhes={'info': dados.get('texto')}, log_type='separacoes')
        return jsonify({'status': 'success'}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@separacoes_bp.route('/notificacoes', methods=['DELETE'])
def limpar_notificacoes():
    # ... (código existente sem alterações)
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
    # ... (código existente sem alterações)
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
    # ... (código existente sem alterações)
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
    
 
@separacoes_bp.route('/status-todos-separadores', methods=['GET'])
def get_status_todos_separadores():
    try:
        todos_separadores_ref = db.reference('usuarios').order_by_child('role').equal_to('Separador').get()
        if not todos_separadores_ref:
            return jsonify([])

        # --- CORREÇÃO AQUI ---
        # Acessa a chave 'nome' de forma segura com .get() para evitar KeyError
        # se algum usuário no banco de dados não tiver o campo 'nome'.
        # Também garante que usuários sem nome não entrem na lista.
        all_separator_names = sorted([
            user.get('nome') for user in todos_separadores_ref.values()
            if user.get('nome') and user.get('nome', '').lower() != 'separacao'
        ])
        
        config_atual = db.reference(FILA_PATH).get() or {}
        nomes_ativos = config_atual.get('ativos', all_separator_names) # Fallback para todos ativos

        resultado = []
        for nome in all_separator_names:
            is_active = nome in nomes_ativos
            resultado.append({'nome': nome, 'ativo': is_active})
            
        return jsonify(resultado)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@separacoes_bp.route('/fila-separadores', methods=['PUT'])
def atualizar_fila_e_status():
    try:
        nomes_ativos_recebidos = request.get_json()
        if not isinstance(nomes_ativos_recebidos, list):
            return jsonify({'error': 'O corpo da requisição deve ser uma lista de nomes.'}), 400

        fila_antiga = _get_fila_separadores()
        
        # --- LÓGICA ALTERADA AQUI ---
        # 1. Identifica os separadores que eram inativos e agora estão ativos.
        novos_ativos = [nome for nome in nomes_ativos_recebidos if nome not in fila_antiga]
        
        # 2. Mantém a ordem apenas dos separadores que já estavam ativos e continuam ativos.
        permaneceram_ativos = [nome for nome in fila_antiga if nome in nomes_ativos_recebidos]
        
        # 3. A nova fila é a junção das duas listas, com os recém-ativados na frente.
        nova_fila_ordenada = novos_ativos + permaneceram_ativos
        # --- FIM DA LÓGICA ALTERADA ---
        
        todos_separadores_ref = db.reference('usuarios').order_by_child('role').equal_to('Separador').get()
        all_separator_names = [user['nome'] for user in todos_separadores_ref.values() if user.get('nome', '').lower() != 'separacao']
        
        inativos = [nome for nome in all_separator_names if nome not in nova_fila_ordenada]
        
        db.reference(FILA_PATH).set({'ativos': nova_fila_ordenada, 'inativos': inativos})
        return jsonify({'status': 'success'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@separacoes_bp.route('/fila-separadores', methods=['GET'])
def get_fila_endpoint():
    try:
        fila_ativos = _get_fila_separadores()
        return jsonify(fila_ativos)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@separacoes_bp.route('/tabela-paginada', methods=['POST'])
def get_tabela_separacoes_paginada():
    # ... (código existente sem alterações)
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
        print(f"ERRO CRÍTICO em get_tabela_separacoes_paginada: {e}")
        return jsonify({'error': str(e)}), 500