# quadro_app/blueprints/conferencias.py
from flask import Blueprint, request, jsonify
from datetime import datetime
from quadro_app import db, tz_cuiaba
from quadro_app.utils import registrar_log

conferencias_bp = Blueprint('conferencias', __name__, url_prefix='/api/conferencias')

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
            'nome_transportadora': 'NOTA DA RUA', # Identificador claro
            'qtd_volumes': dados.get('qtd_volumes'),
            'vendedor_nome': dados.get('vendedor_nome'), # Salva o vendedor
            'status': 'Finalizado', # Status já é finalizado
            'data_inicio_conferencia': now_iso,
            'data_finalizacao': now_iso, # Data de finalização é a mesma da criação
            'conferente_nome': 'N/A' # Não passa por conferência
        }
        
        ref = db.reference('conferencias')
        nova_ref = ref.push(novo_recebimento)
        
        log_detalhes = f"Recebimento de Nota da Rua (NF: '{dados.get('numero_nota_fiscal')}') para o vendedor '{dados.get('vendedor_nome')}'."
        registrar_log(nova_ref.key, editor_nome, 'RECEBIMENTO_RUA_CRIADO', detalhes={'info': log_detalhes}, log_type='conferencias')
        
        return jsonify({'status': 'success', 'id': nova_ref.key}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Endpoint para a página "Recebimento" criar um novo espelho
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
            'status': 'Aguardando Conferência',
            'data_inicio_conferencia': None,
            'data_finalizacao': None,
            'conferente_nome': ''
            # O campo 'vendedor_nome' não existe neste fluxo
        }
        
        ref = db.reference('conferencias')
        nova_ref = ref.push(novo_recebimento)
        
        log_detalhes = f"Recebimento da NF '{dados.get('numero_nota_fiscal')}' do fornecedor '{dados.get('nome_fornecedor')}'."
        registrar_log(nova_ref.key, editor_nome, 'RECEBIMENTO_CRIADO', detalhes={'info': log_detalhes}, log_type='conferencias')
        
        return jsonify({'status': 'success', 'id': nova_ref.key}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Endpoint para o estoquista iniciar a conferência
@conferencias_bp.route('/<string:conferencia_id>/iniciar', methods=['PUT'])
def iniciar_conferencia(conferencia_id):
    dados = request.get_json()
    conferentes = dados.get('conferentes') # Lista de nomes
    
    if not conferentes or not isinstance(conferentes, list):
        return jsonify({'error': 'Lista de conferentes é obrigatória.'}), 400

    try:
        ref = db.reference(f'conferencias/{conferencia_id}')
        updates = {
            'status': 'Em Conferência',
            'data_inicio_conferencia': datetime.now(tz_cuiaba).isoformat(),
            'conferentes': conferentes, # Salva a lista de nomes
            'conferente_nome': ', '.join(conferentes) # Campo antigo para compatibilidade/busca
        }
        ref.update(updates)
        
        # Log com o nome de quem iniciou, se disponível, ou o primeiro da lista
        editor_nome = dados.get('editor_nome', conferentes[0])
        registrar_log(conferencia_id, editor_nome, 'INICIO_CONFERENCIA', detalhes={'conferentes': conferentes}, log_type='conferencias')
        
        return jsonify({'status': 'success'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Endpoint para o estoquista finalizar (com ou sem pendência)
@conferencias_bp.route('/<string:conferencia_id>/finalizar', methods=['PUT'])
def finalizar_conferencia(conferencia_id):
    dados = request.get_json()
    editor_nome = dados.get('editor_nome', 'N/A')
    com_pendencia = dados.get('com_pendencia', False)
    observacao = dados.get('observacao', '')

    try:
        ref = db.reference(f'conferencias/{conferencia_id}')
        
        novo_status = 'Pendente de Resolução' if com_pendencia else 'Finalizado'
        
        updates = {
            'status': novo_status,
            'data_finalizacao': datetime.now(tz_cuiaba).isoformat()
        }
        ref.update(updates)
        
        log_acao = 'FINALIZADO_COM_PENDENCIA' if com_pendencia else 'FINALIZADO_OK'
        registrar_log(conferencia_id, editor_nome, log_acao, log_type='conferencias')

        if observacao:
            obs_ref = ref.child('observacoes')
            nova_observacao = {
                'texto': observacao,
                'autor': editor_nome,
                'timestamp': datetime.now(tz_cuiaba).isoformat()
            }
            obs_ref.push(nova_observacao)
            registrar_log(conferencia_id, editor_nome, 'NOVA OBSERVAÇÃO', detalhes={'info': observacao}, log_type='conferencias')

        return jsonify({'status': 'success'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Endpoint para o gestor resolver uma pendência
@conferencias_bp.route('/<string:conferencia_id>/resolver', methods=['PUT'])
def resolver_pendencia(conferencia_id):
    dados = request.get_json()
    editor_nome = dados.get('editor_nome', 'N/A')
    observacao = dados.get('observacao', '')
    
    try:
        ref = db.reference(f'conferencias/{conferencia_id}')
        ref.update({'status': 'Finalizado'})
        
        registrar_log(conferencia_id, editor_nome, 'PENDENCIA_RESOLVIDA', log_type='conferencias')

        # CORREÇÃO: Adiciona a observação de resolução ao histórico
        if observacao:
            obs_ref = ref.child('observacoes')
            nova_observacao = {
                'texto': f"[RESOLUÇÃO] {observacao}",
                'autor': editor_nome,
                'timestamp': datetime.now(tz_cuiaba).isoformat()
            }
            obs_ref.push(nova_observacao)
            registrar_log(conferencia_id, editor_nome, 'OBSERVACAO_RESOLUCAO', detalhes={'info': observacao}, log_type='conferencias')

        return jsonify({'status': 'success'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

        
# As rotas de editar, deletar e adicionar observação continuam úteis
# ... (cole aqui as funções editar_conferencia, deletar_conferencia e adicionar_observacao do passo anterior) ...
@conferencias_bp.route('/<string:conferencia_id>', methods=['PUT'])
def editar_conferencia(conferencia_id):
    dados = request.get_json()
    editor_nome = dados.pop('editor_nome', 'N/A')
    
    try:
        ref = db.reference(f'conferencias/{conferencia_id}')
        conferencia_antiga = ref.get()
        if not conferencia_antiga:
            return jsonify({'error': 'Conferência não encontrada'}), 404

        ref.update(dados)

        alteracoes = []
        for chave, valor_novo in dados.items():
            valor_antigo = conferencia_antiga.get(chave, '')
            if str(valor_antigo) != str(valor_novo):
                alteracoes.append(f"alterou '{chave}' de '{valor_antigo}' para '{valor_novo}'")
        
        if alteracoes:
            log_detalhes = f"Editou a conferência: {', '.join(alteracoes)}."
            registrar_log(conferencia_id, editor_nome, 'EDIÇÃO', detalhes={'info': log_detalhes}, log_type='conferencias')
        
        return jsonify({'status': 'success'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@conferencias_bp.route('/<string:conferencia_id>/observacao', methods=['POST'])
def adicionar_observacao(conferencia_id):
    dados = request.get_json()
    autor_nome = dados.get('autor', 'N/A')
    
    try:
        obs_ref = db.reference(f'conferencias/{conferencia_id}/observacoes')
        nova_observacao = {
            'texto': dados.get('texto', ''),
            'autor': autor_nome,
            'timestamp': datetime.now(tz_cuiaba).isoformat()
        }
        obs_ref.push(nova_observacao)
        
        registrar_log(conferencia_id, autor_nome, 'NOVA OBSERVAÇÃO', detalhes={'info': dados.get('texto')}, log_type='conferencias')
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
        registrar_log(conferencia_id, editor_nome, 'EXCLUSÃO', detalhes={'info': log_detalhes}, log_type='conferencias')
        
        ref.delete()
        db.reference(f'logs_conferencias/{conferencia_id}').delete()
        return jsonify({'status': 'success'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500