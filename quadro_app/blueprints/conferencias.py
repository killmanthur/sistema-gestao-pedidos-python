# quadro_app/blueprints/conferencias.py
from flask import Blueprint, request, jsonify
from datetime import datetime
from quadro_app import db, tz_cuiaba
from quadro_app.utils import registrar_log

conferencias_bp = Blueprint('conferencias', __name__, url_prefix='/api/conferencias')

@conferencias_bp.route('/<string:conferencia_id>', methods=['PUT'])
def editar_conferencia(conferencia_id):
    dados = request.get_json()
    editor_nome = dados.get('editor_nome', 'N/A')
    
    try:
        ref = db.reference(f'conferencias/{conferencia_id}')
        item_antigo = ref.get()
        if not item_antigo:
            return jsonify({'error': 'Item de conferência não encontrado'}), 404
        
        # Log de alterações ANTES de atualizar
        alteracoes = []
        # ****** CAMPO ADICIONADO À LISTA DE LOG ******
        campos_principais = ['numero_nota_fiscal', 'nome_fornecedor', 'nome_transportadora', 'qtd_volumes', 'vendedor_nome', 'recebido_por']
        for campo in campos_principais:
            valor_antigo = item_antigo.get(campo, '')
            valor_novo = dados.get(campo)

            # Apenas registra se o novo valor foi enviado e é diferente do antigo
            if valor_novo is not None and str(valor_antigo) != str(valor_novo):
                alteracoes.append(f"'{campo}' de '{valor_antigo or 'Nenhum'}' para '{valor_novo or 'Nenhum'}'")
        
        if alteracoes:
            log_info = f"Editou: {', '.join(alteracoes)}."
            registrar_log(conferencia_id, editor_nome, 'EDICAO_GERAL', detalhes={'info': log_info}, log_type='conferencias')

        ref.update(dados)
        return jsonify({'status': 'success'}), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ****** ROTA MODIFICADA AQUI ******
@conferencias_bp.route('/<string:conferencia_id>/solicitar-alteracao', methods=['PUT'])
def solicitar_alteracao_posterior(conferencia_id):
    dados = request.get_json()
    editor_nome = dados.get('editor_nome', 'N/A')
    observacao = dados.get('observacao')

    # Validação da observação
    if not observacao or not observacao.strip():
        return jsonify({'error': 'A observação é obrigatória para solicitar alteração.'}), 400

    try:
        ref = db.reference(f'conferencias/{conferencia_id}')
        item_atual = ref.get()
        if not item_atual:
            return jsonify({'error': 'Item não encontrado'}), 404

        status_atual = item_atual.get('status')
        novo_status = status_atual
        
        if status_atual == 'Pendente (Fornecedor)':
            novo_status = 'Pendente (Ambos)'
        elif status_atual == 'Finalizado':
            novo_status = 'Pendente (Alteração)'
        else:
            return jsonify({'status': 'success', 'message': 'Nenhuma alteração necessária.'}), 200

        updates = {
            'status': novo_status,
            'resolvido_contabilidade': False
        }
        ref.update(updates)

        # Adiciona a observação ao histórico do item
        obs_ref = ref.child('observacoes')
        obs_ref.push({
            'texto': f"[SOLICITAÇÃO DE ALTERAÇÃO] {observacao}",
            'autor': editor_nome,
            'timestamp': datetime.now(tz_cuiaba).isoformat()
        })

        log_info = f"Item movido de '{status_atual}' para '{novo_status}' com a observação: '{observacao}'"
        registrar_log(conferencia_id, editor_nome, 'SOLICITACAO_ALTERACAO_POSTERIOR', detalhes={'info': log_info}, log_type='conferencias')
        
        return jsonify({'status': 'success'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
# ****** FIM DA MODIFICAÇÃO ******


@conferencias_bp.route('/recebimento-rua', methods=['POST'])
def criar_recebimento_rua():
    dados = request.get_json()
    editor_nome = dados.get('editor_nome', 'Sistema')
    
    try:
        now_iso = datetime.now(tz_cuiaba).isoformat()
        
        novo_recebimento = {
            'data_recebimento': now_iso,
            'numero_nota_fiscal': dados.get('numero_nota_fiscal'),
            'nome_fornecedor': dados.get('nome_fornecedor'),
            'nome_transportadora': 'NOTA DA RUA',
            'qtd_volumes': dados.get('qtd_volumes'),
            'vendedor_nome': dados.get('vendedor_nome'),
            'recebido_por': dados.get('recebido_por'),
            'status': 'Aguardando Conferência',
            'data_inicio_conferencia': now_iso,
            'data_finalizacao': None,
            'conferentes': [editor_nome],
            'resolvido_gestor': False,
            'resolvido_contabilidade': False
        }
        
        ref = db.reference('conferencias')
        nova_ref = ref.push(novo_recebimento)
        
        log_detalhes_info = f"Registro de Nota da Rua (NF: '{dados.get('numero_nota_fiscal')}') para o vendedor '{dados.get('vendedor_nome')}'."
        registrar_log(nova_ref.key, editor_nome, 'RECEBIMENTO_RUA_CRIADO', detalhes={'info': log_detalhes_info}, log_type='conferencias')

        return finalizar_conferencia_nova_logica(nova_ref.key)

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@conferencias_bp.route('/<string:conferencia_id>/finalizar-conferencia', methods=['PUT'])
def finalizar_conferencia_nova_logica(conferencia_id):
    dados = request.get_json()
    editor_nome = dados.get('editor_nome', 'N/A')
    observacao = dados.get('observacao', '')
    tem_pendencia_fornecedor = dados.get('tem_pendencia_fornecedor', False)
    solicita_alteracao = dados.get('solicita_alteracao', False)

    if (tem_pendencia_fornecedor or solicita_alteracao) and not observacao.strip():
        return jsonify({'error': 'Observação é obrigatória quando há divergências.'}), 400

    try:
        ref = db.reference(f'conferencias/{conferencia_id}')
        
        novo_status = 'Finalizado'
        if tem_pendencia_fornecedor and solicita_alteracao:
            novo_status = 'Pendente (Ambos)'
        elif tem_pendencia_fornecedor:
            novo_status = 'Pendente (Fornecedor)'
        elif solicita_alteracao:
            novo_status = 'Pendente (Alteração)'

        updates = {
            'status': novo_status,
            'data_finalizacao': datetime.now(tz_cuiaba).isoformat(),
            'resolvido_gestor': not tem_pendencia_fornecedor,
            'resolvido_contabilidade': not solicita_alteracao
        }
        ref.update(updates)
        
        log_acao = f'FINALIZADO_COM_STATUS_{novo_status.upper()}'
        registrar_log(conferencia_id, editor_nome, log_acao, detalhes={'info': observacao}, log_type='conferencias')

        if observacao:
            obs_ref = ref.child('observacoes')
            obs_ref.push({
                'texto': f"[DIVERGÊNCIA] {observacao}",
                'autor': editor_nome,
                'timestamp': datetime.now(tz_cuiaba).isoformat()
            })

        return jsonify({'status': 'success'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@conferencias_bp.route('/<string:conferencia_id>/resolver-item', methods=['PUT'])
def resolver_item_pendencia(conferencia_id):
    dados = request.get_json()
    editor_nome = dados.get('editor_nome', 'N/A')
    user_role = dados.get('user_role', 'N/A')
    observacao = dados.get('observacao', '')

    if not observacao.strip():
        return jsonify({'error': 'A observação de resolução é obrigatória.'}), 400

    try:
        ref = db.reference(f'conferencias/{conferencia_id}')
        item_atual = ref.get()
        if not item_atual:
            return jsonify({'error': 'Item não encontrado'}), 404

        updates = {}
        log_acao = ''
        
        if user_role in ['Admin', 'Estoque']:
            updates['resolvido_gestor'] = True
            log_acao = 'PENDENCIA_FORNECEDOR_RESOLVIDA'
        elif user_role == 'Contabilidade':
            updates['resolvido_contabilidade'] = True
            log_acao = 'ALTERACAO_CONTABILIDADE_RESOLVIDA'
        else:
            return jsonify({'error': 'Você não tem permissão para resolver este item.'}), 403

        gestor_ok = updates.get('resolvido_gestor', item_atual.get('resolvido_gestor', False))
        contabilidade_ok = updates.get('resolvido_contabilidade', item_atual.get('resolvido_contabilidade', False))
        
        status_atual = item_atual.get('status')
        if status_atual == 'Pendente (Ambos)':
            if gestor_ok and contabilidade_ok:
                updates['status'] = 'Finalizado'
        elif status_atual == 'Pendente (Fornecedor)' and gestor_ok:
            updates['status'] = 'Finalizado'
        elif status_atual == 'Pendente (Alteração)' and contabilidade_ok:
            updates['status'] = 'Finalizado'

        ref.update(updates)
        
        registrar_log(conferencia_id, editor_nome, log_acao, detalhes={'info': observacao}, log_type='conferencias')
        obs_ref = ref.child('observacoes')
        obs_ref.push({
            'texto': f"[{log_acao}] {observacao}",
            'autor': editor_nome,
            'timestamp': datetime.now(tz_cuiaba).isoformat()
        })
        
        return jsonify({'status': 'success'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@conferencias_bp.route('/recebimento', methods=['POST'])
def criar_recebimento():
    dados = request.get_json()
    editor_nome = dados.get('editor_nome', 'Sistema')
    try:
        novo_recebimento = {
            'data_recebimento': datetime.now(tz_cuiaba).isoformat(),
            'numero_nota_fiscal': dados.get('numero_nota_fiscal'),
            'nome_fornecedor': dados.get('nome_fornecedor'),
            'nome_transportadora': dados.get('nome_transportadora'),
            'qtd_volumes': dados.get('qtd_volumes'),
            'recebido_por': dados.get('recebido_por'),
            'status': 'Aguardando Conferência',
            'data_inicio_conferencia': None,
            'data_finalizacao': None,
            'conferente_nome': ''
        }
        ref = db.reference('conferencias')
        nova_ref = ref.push(novo_recebimento)
        log_detalhes = f"Recebimento da NF '{dados.get('numero_nota_fiscal')}'."
        registrar_log(nova_ref.key, editor_nome, 'RECEBIMENTO_CRIADO', detalhes={'info': log_detalhes}, log_type='conferencias')
        return jsonify({'status': 'success', 'id': nova_ref.key}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@conferencias_bp.route('/<string:conferencia_id>/iniciar', methods=['PUT'])
def iniciar_conferencia(conferencia_id):
    dados = request.get_json()
    conferentes = dados.get('conferentes')
    if not conferentes or not isinstance(conferentes, list):
        return jsonify({'error': 'Lista de conferentes é obrigatória.'}), 400
    try:
        ref = db.reference(f'conferencias/{conferencia_id}')
        updates = {
            'status': 'Em Conferência',
            'data_inicio_conferencia': datetime.now(tz_cuiaba).isoformat(),
            'conferentes': conferentes,
            'conferente_nome': ', '.join(conferentes)
        }
        ref.update(updates)
        editor_nome = dados.get('editor_nome', conferentes[0])
        registrar_log(conferencia_id, editor_nome, 'INICIO_CONFERENCIA', detalhes={'conferentes': conferentes}, log_type='conferencias')
        return jsonify({'status': 'success'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@conferencias_bp.route('/<string:conferencia_id>/observacao', methods=['POST'])
def adicionar_observacao(conferencia_id):
    dados = request.get_json()
    autor_nome = dados.get('autor', 'N/A')
    texto_obs = dados.get('texto', '')

    if not texto_obs.strip():
        return jsonify({'error': 'A observação não pode estar vazia.'}), 400

    try:
        ref = db.reference(f'conferencias/{conferencia_id}')
        if not ref.get():
            return jsonify({'error': 'Conferência não encontrada.'}), 404

        obs_ref = ref.child('observacoes')
        nova_observacao = {
            'texto': texto_obs,
            'autor': autor_nome,
            'timestamp': datetime.now(tz_cuiaba).isoformat()
        }
        obs_ref.push(nova_observacao)
        
        registrar_log(conferencia_id, autor_nome, 'NOVA_ATUALIZACAO', detalhes={'info': texto_obs}, log_type='conferencias')
        return jsonify({'status': 'success'}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500
        
@conferencias_bp.route('/<string:conferencia_id>', methods=['DELETE'])
def deletar_conferencia(conferencia_id):
    dados = request.get_json()
    editor_nome = dados.get('editor_nome', 'N/A')
    try:
        ref = db.reference(f'conferencias/{conferencia_id}')
        conferencia = ref.get()
        if not conferencia:
            return jsonify({'error': 'Conferência não encontrada.'}), 404
            
        nf = conferencia.get('numero_nota_fiscal', 'N/A')
        log_detalhes = f"Excluiu a conferência da NF '{nf}'."
        
        registrar_log(conferencia_id, editor_nome, 'EXCLUSAO', detalhes={'info': log_detalhes}, log_type='conferencias')
        
        ref.delete()
        db.reference(f'logs_conferencias/{conferencia_id}').delete()
        
        return jsonify({'status': 'success'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500