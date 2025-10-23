# quadro_app/blueprints/conferencias.py
from flask import Blueprint, request, jsonify
from datetime import datetime
from quadro_app import db, tz_cuiaba
from quadro_app.models import Conferencia
from quadro_app.utils import registrar_log

conferencias_bp = Blueprint('conferencias', __name__, url_prefix='/api/conferencias')

def serialize_conferencia(c):
    """Converte um objeto Conferencia do SQLAlchemy em um dicionário para JSON."""
    if not c:
        return None
    return {
        'id': c.id,
        'data_recebimento': c.data_recebimento,
        'numero_nota_fiscal': c.numero_nota_fiscal,
        'nome_fornecedor': c.nome_fornecedor,
        'nome_transportadora': c.nome_transportadora,
        'qtd_volumes': c.qtd_volumes,
        'vendedor_nome': c.vendedor_nome,
        'recebido_por': c.recebido_por,
        'status': c.status,
        'data_inicio_conferencia': c.data_inicio_conferencia,
        'data_finalizacao': c.data_finalizacao,
        'conferentes': c.conferentes,
        'observacoes': c.observacoes,
        'resolvido_gestor': c.resolvido_gestor,
        'resolvido_contabilidade': c.resolvido_contabilidade
    }

@conferencias_bp.route('/recebimento', methods=['POST'])
def criar_recebimento():
    dados = request.get_json()
    editor_nome = dados.get('editor_nome', 'Sistema')
    novo_recebimento = Conferencia(
        data_recebimento=datetime.now(tz_cuiaba).isoformat(),
        numero_nota_fiscal=dados.get('numero_nota_fiscal'),
        nome_fornecedor=dados.get('nome_fornecedor'),
        nome_transportadora=dados.get('nome_transportadora'),
        qtd_volumes=dados.get('qtd_volumes'),
        recebido_por=dados.get('recebido_por'),
        status='Aguardando Conferência'
    )
    db.session.add(novo_recebimento)
    db.session.commit()
    registrar_log(novo_recebimento.id, editor_nome, 'RECEBIMENTO_CRIADO', log_type='conferencias')
    return jsonify({'status': 'success', 'id': novo_recebimento.id}), 201

@conferencias_bp.route('/recebimento-rua', methods=['POST'])
def criar_recebimento_rua():
    dados = request.get_json()
    editor_nome = dados.get('editor_nome', 'Sistema')
    now_iso = datetime.now(tz_cuiaba).isoformat()
    
    novo_recebimento = Conferencia(
        data_recebimento=now_iso,
        numero_nota_fiscal=dados.get('numero_nota_fiscal'),
        nome_fornecedor=dados.get('nome_fornecedor'),
        nome_transportadora='NOTA DA RUA',
        qtd_volumes=dados.get('qtd_volumes'),
        vendedor_nome=dados.get('vendedor_nome'),
        recebido_por=dados.get('recebido_por'),
        status='Aguardando Conferência',
        data_inicio_conferencia=now_iso,
        conferentes=[editor_nome]
    )
    db.session.add(novo_recebimento)
    db.session.commit()
    registrar_log(novo_recebimento.id, editor_nome, 'RECEBIMENTO_RUA_CRIADO', log_type='conferencias')
    return finalizar_conferencia_nova_logica(novo_recebimento.id)

@conferencias_bp.route('/<int:conferencia_id>', methods=['PUT'])
def editar_conferencia(conferencia_id):
    dados = request.get_json()
    editor_nome = dados.pop('editor_nome', 'N/A')
    conferencia = Conferencia.query.get_or_404(conferencia_id)

    for key, value in dados.items():
        if hasattr(conferencia, key):
            setattr(conferencia, key, value)
            
    db.session.commit()
    registrar_log(conferencia_id, editor_nome, 'EDICAO_GERAL', log_type='conferencias')
    return jsonify({'status': 'success'})

@conferencias_bp.route('/<int:conferencia_id>', methods=['DELETE'])
def deletar_conferencia(conferencia_id):
    editor_nome = request.json.get('editor_nome', 'N/A')
    conferencia = Conferencia.query.get_or_404(conferencia_id)
    db.session.delete(conferencia)
    db.session.commit()
    registrar_log(conferencia_id, editor_nome, 'EXCLUSAO', log_type='conferencias')
    return jsonify({'status': 'success'})
    
@conferencias_bp.route('/<int:conferencia_id>/iniciar', methods=['PUT'])
def iniciar_conferencia(conferencia_id):
    dados = request.get_json()
    editor_nome = dados.get('editor_nome', 'N/A')
    conferencia = Conferencia.query.get_or_404(conferencia_id)
    
    conferencia.status = 'Em Conferência'
    conferencia.data_inicio_conferencia = datetime.now(tz_cuiaba).isoformat()
    conferencia.conferentes = dados.get('conferentes')
    
    db.session.commit()
    registrar_log(conferencia_id, editor_nome, 'INICIO_CONFERENCIA', detalhes={'conferentes': dados.get('conferentes')}, log_type='conferencias')
    return jsonify({'status': 'success'})

@conferencias_bp.route('/<int:conferencia_id>/finalizar-conferencia', methods=['PUT'])
def finalizar_conferencia_nova_logica(conferencia_id):
    dados = request.get_json()
    editor_nome = dados.get('editor_nome', 'N/A')
    conferencia = Conferencia.query.get_or_404(conferencia_id)

    tem_pendencia = dados.get('tem_pendencia_fornecedor', False)
    solicita_alteracao = dados.get('solicita_alteracao', False)
    observacao = dados.get('observacao', '')

    if (tem_pendencia or solicita_alteracao) and not observacao.strip():
        return jsonify({'error': 'Observação é obrigatória quando há divergências.'}), 400

    if tem_pendencia and solicita_alteracao:
        conferencia.status = 'Pendente (Ambos)'
    elif tem_pendencia:
        conferencia.status = 'Pendente (Fornecedor)'
    elif solicita_alteracao:
        conferencia.status = 'Pendente (Alteração)'
    else:
        conferencia.status = 'Finalizado'
    
    conferencia.data_finalizacao = datetime.now(tz_cuiaba).isoformat()
    conferencia.resolvido_gestor = not tem_pendencia
    conferencia.resolvido_contabilidade = not solicita_alteracao
    
    if observacao:
        obs_atuais = conferencia.observacoes or []
        obs_atuais.append({
            'texto': f"[DIVERGÊNCIA] {observacao}", 'autor': editor_nome,
            'timestamp': datetime.now(tz_cuiaba).isoformat()
        })
        conferencia.observacoes = list(obs_atuais)

    db.session.commit()
    registrar_log(conferencia_id, editor_nome, f'FINALIZADO_COM_STATUS_{conferencia.status.upper()}', detalhes={'info': observacao}, log_type='conferencias')
    return jsonify({'status': 'success'})

@conferencias_bp.route('/<int:conferencia_id>/solicitar-alteracao', methods=['PUT'])
def solicitar_alteracao_posterior(conferencia_id):
    dados = request.get_json()
    editor_nome = dados.get('editor_nome', 'N/A')
    conferencia = Conferencia.query.get_or_404(conferencia_id)
    observacao = dados.get('observacao')

    if not observacao or not observacao.strip():
        return jsonify({'error': 'A observação é obrigatória.'}), 400

    status_atual = conferencia.status
    if status_atual == 'Pendente (Fornecedor)': conferencia.status = 'Pendente (Ambos)'
    elif status_atual == 'Finalizado': conferencia.status = 'Pendente (Alteração)'
    else: return jsonify({'status': 'success', 'message': 'Nenhuma alteração de status.'})

    conferencia.resolvido_contabilidade = False
    obs_atuais = conferencia.observacoes or []
    obs_atuais.append({
        'texto': f"[SOLICITAÇÃO DE ALTERAÇÃO] {observacao}", 'autor': editor_nome,
        'timestamp': datetime.now(tz_cuiaba).isoformat()
    })
    conferencia.observacoes = list(obs_atuais)
    db.session.commit()
    registrar_log(conferencia_id, editor_nome, 'SOLICITACAO_ALTERACAO_POSTERIOR', detalhes={'info': observacao}, log_type='conferencias')
    return jsonify({'status': 'success'})

@conferencias_bp.route('/<int:conferencia_id>/resolver-item', methods=['PUT'])
def resolver_item_pendencia(conferencia_id):
    dados = request.get_json()
    editor_nome = dados.get('editor_nome', 'N/A')
    conferencia = Conferencia.query.get_or_404(conferencia_id)
    user_role = dados.get('user_role')
    observacao = dados.get('observacao')

    if not observacao or not observacao.strip():
        return jsonify({'error': 'A observação de resolução é obrigatória.'}), 400

    log_acao = ''
    if user_role in ['Admin', 'Estoque']:
        conferencia.resolvido_gestor = True
        log_acao = 'PENDENCIA_FORNECEDOR_RESOLVIDA'
    elif user_role == 'Contabilidade':
        conferencia.resolvido_contabilidade = True
        log_acao = 'ALTERACAO_CONTABILIDADE_RESOLVIDA'
    else:
        return jsonify({'error': 'Permissão negada.'}), 403

    if conferencia.resolvido_gestor and conferencia.resolvido_contabilidade:
        conferencia.status = 'Finalizado'

    obs_atuais = conferencia.observacoes or []
    obs_atuais.append({
        'texto': f"[{log_acao}] {observacao}", 'autor': editor_nome,
        'timestamp': datetime.now(tz_cuiaba).isoformat()
    })
    conferencia.observacoes = list(obs_atuais)
    db.session.commit()
    registrar_log(conferencia_id, editor_nome, log_acao, detalhes={'info': observacao}, log_type='conferencias')
    return jsonify({'status': 'success'})

@conferencias_bp.route('/ativas', methods=['GET'])
def get_conferencias_ativas():
    """Retorna conferências com status 'Aguardando Conferência' ou 'Em Conferência'."""
    try:
        status_ativos = ['Aguardando Conferência', 'Em Conferência']
        ativas = Conferencia.query.filter(Conferencia.status.in_(status_ativos)).order_by(Conferencia.data_recebimento.desc()).all()
        return jsonify([serialize_conferencia(c) for c in ativas])
    except Exception as e:
        print(f"ERRO ao buscar conferências ativas: {e}")
        return jsonify({'error': str(e)}), 500

@conferencias_bp.route('/<int:conferencia_id>/observacao', methods=['POST'])
def adicionar_observacao(conferencia_id):
    dados = request.get_json()
    editor_nome = dados.get('autor', 'N/A')
    conferencia = Conferencia.query.get_or_404(conferencia_id)
    
    # --- INÍCIO DA CORREÇÃO ---
    # Garante que 'obs_atuais' seja sempre uma lista
    obs_atuais = conferencia.observacoes or []
    # Se por acaso os dados antigos forem um dicionário, converte para uma lista de seus valores
    if isinstance(obs_atuais, dict):
        obs_atuais = list(obs_atuais.values())
    # --- FIM DA CORREÇÃO ---

    nova_obs = {
        'texto': dados.get('texto', ''), 'autor': editor_nome,
        'timestamp': datetime.now(tz_cuiaba).isoformat()
    }
    obs_atuais.append(nova_obs)
    
    conferencia.observacoes = obs_atuais # Reatribui a lista para garantir a detecção
    db.session.commit()
    registrar_log(conferencia_id, editor_nome, 'NOVA_ATUALIZACAO', detalhes={'info': dados.get('texto')}, log_type='conferencias')
    return jsonify({'status': 'success'})

@conferencias_bp.route('/pendentes-e-resolvidas', methods=['GET'])
def get_pendentes_e_resolvidas():
    status_relevantes = ['Pendente (Fornecedor)', 'Pendente (Alteração)', 'Pendente (Ambos)', 'Finalizado']
    itens = Conferencia.query.filter(Conferencia.status.in_(status_relevantes)).order_by(Conferencia.data_recebimento.desc()).all()
    return jsonify([serialize_conferencia(c) for c in itens])

@conferencias_bp.route('/recentes', methods=['GET'])
def get_recebimentos_recentes():
    recentes = Conferencia.query.order_by(Conferencia.data_recebimento.desc()).limit(200).all()
    return jsonify([serialize_conferencia(c) for c in recentes])

@conferencias_bp.route('/<int:conferencia_id>', methods=['GET'])
def get_conferencia_por_id(conferencia_id):
    """Busca os dados de uma única conferência pelo seu ID."""
    conferencia = Conferencia.query.get_or_404(conferencia_id)
    return jsonify(serialize_conferencia(conferencia))