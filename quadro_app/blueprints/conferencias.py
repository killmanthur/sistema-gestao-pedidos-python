# quadro_app/blueprints/conferencias.py
from flask import Blueprint, request, jsonify
from datetime import datetime
from sqlalchemy import or_
from quadro_app import db, tz_cuiaba
from quadro_app.models import Conferencia
from quadro_app.utils import registrar_log

conferencias_bp = Blueprint('conferencias', __name__, url_prefix='/api/conferencias')

def serialize_conferencia(c):
    """Converte um objeto Conferencia do SQLAlchemy em um dicionário para JSON."""
    if not c: return None
    return {
        'id': c.id, 'data_recebimento': c.data_recebimento, 'numero_nota_fiscal': c.numero_nota_fiscal,
        'nome_fornecedor': c.nome_fornecedor, 'nome_transportadora': c.nome_transportadora,
        'qtd_volumes': c.qtd_volumes, 'vendedor_nome': c.vendedor_nome, 'recebido_por': c.recebido_por,
        'status': c.status, 'data_inicio_conferencia': c.data_inicio_conferencia,
        'data_finalizacao': c.data_finalizacao, 'conferentes': c.conferentes, 'observacoes': c.observacoes,
        'resolvido_gestor': c.resolvido_gestor, 'resolvido_contabilidade': c.resolvido_contabilidade
    }

# --- ROTAS PRINCIPAIS DO FLUXO ---

@conferencias_bp.route('/<int:conferencia_id>/reiniciar', methods=['PUT'])
def reiniciar_conferencia(conferencia_id):
    dados = request.get_json()
    autor = dados.get('autor')
    motivo = dados.get('motivo')

    if not autor or not motivo:
        return jsonify({'error': 'Autor e motivo são obrigatórios.'}), 400

    conferencia = Conferencia.query.get_or_404(conferencia_id)

    # Reverte o status para 'Em Conferência'
    conferencia.status = 'Em Conferência'
    
    # Limpa a data de finalização e os flags de resolução
    conferencia.data_finalizacao = None
    conferencia.resolvido_gestor = False
    conferencia.resolvido_contabilidade = False

    # Adiciona a justificativa ao log de observações
    obs_atuais = conferencia.observacoes or []
    nova_obs = {
        'texto': f"[REINICIADO] {motivo}",
        'autor': autor,
        'timestamp': datetime.now(tz_cuiaba).isoformat()
    }
    obs_atuais.append(nova_obs)
    conferencia.observacoes = list(obs_atuais)

    # Se não houver conferentes definidos (pode acontecer em notas de rua antigas), adiciona o autor
    if not conferencia.conferentes:
        conferencia.conferentes = [autor]

    db.session.commit()
    
    registrar_log(conferencia_id, autor, 'CONFERENCIA_REINICIADA', detalhes={'info': motivo}, log_type='conferencias')
    
    return jsonify({'status': 'success', 'message': 'Conferência reiniciada com sucesso.'})

@conferencias_bp.route('/<int:conferencia_id>/finalizar-conferencia', methods=['PUT'])
def finalizar_conferencia_logica(conferencia_id):
    dados = request.get_json()
    editor_nome = dados.get('editor_nome', 'N/A')
    conferencia = Conferencia.query.get_or_404(conferencia_id)

    tem_pendencia_fornecedor = dados.get('tem_pendencia_fornecedor', False)
    solicita_alteracao = dados.get('solicita_alteracao', False)
    observacao = dados.get('observacao', '')

    if (tem_pendencia_fornecedor or solicita_alteracao) and not observacao.strip():
        return jsonify({'error': 'Observação é obrigatória quando há divergências.'}), 400

    if tem_pendencia_fornecedor and solicita_alteracao:
        conferencia.status = 'Pendente (Ambos)'
    elif tem_pendencia_fornecedor:
        conferencia.status = 'Pendente (Fornecedor)'
    elif solicita_alteracao:
        conferencia.status = 'Pendente (Alteração)'
    else:
        conferencia.status = 'Finalizado'
    
    conferencia.data_finalizacao = datetime.now(tz_cuiaba).isoformat()
    conferencia.resolvido_gestor = not tem_pendencia_fornecedor
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
        conferencia.data_finalizacao = datetime.now(tz_cuiaba).isoformat()

    obs_atuais = conferencia.observacoes or []
    obs_atuais.append({
        'texto': f"[{log_acao}] {observacao}", 'autor': editor_nome,
        'timestamp': datetime.now(tz_cuiaba).isoformat()
    })
    conferencia.observacoes = list(obs_atuais)
    db.session.commit()
    registrar_log(conferencia_id, editor_nome, log_acao, detalhes={'info': observacao}, log_type='conferencias')
    return jsonify({'status': 'success'})

@conferencias_bp.route('/<int:conferencia_id>/observacao', methods=['POST'])
def adicionar_observacao(conferencia_id):
    dados = request.get_json()
    editor_nome = dados.get('autor', 'N/A')
    conferencia = Conferencia.query.get_or_404(conferencia_id)
    
    obs_atuais = conferencia.observacoes or []
    nova_obs = {
        'texto': f"[ATUALIZAÇÃO] {dados.get('texto', '')}", 'autor': editor_nome,
        'timestamp': datetime.now(tz_cuiaba).isoformat()
    }
    obs_atuais.append(nova_obs)
    
    conferencia.observacoes = list(obs_atuais)
    db.session.commit()
    registrar_log(conferencia_id, editor_nome, 'NOVA_ATUALIZACAO', detalhes={'info': dados.get('texto')}, log_type='conferencias')
    return jsonify({'status': 'success'})

# --- ROTAS DE BUSCA DE DADOS ---

@conferencias_bp.route('/ativas', methods=['GET'])
def get_conferencias_ativas():
    status_relevantes = ['Aguardando Conferência', 'Em Conferência', 'Pendente (Fornecedor)', 'Pendente (Alteração)', 'Pendente (Ambos)']
    itens = Conferencia.query.filter(Conferencia.status.in_(status_relevantes)).order_by(Conferencia.data_recebimento.desc()).all()
    return jsonify([serialize_conferencia(c) for c in itens])

# --- INÍCIO DA CORREÇÃO ---
@conferencias_bp.route('/historico', methods=['POST'])
def get_historico_conferencias():
    try:
        filtros = request.get_json() or {}
        page = filtros.get('page', 0)
        limit = filtros.get('limit', 20)

        # A query base sempre busca por status 'Finalizado'
        query = Conferencia.query.filter_by(status='Finalizado')

        # Aplica filtros APENAS se eles existirem no corpo da requisição
        if filtros.get('fornecedor'):
            query = query.filter(Conferencia.nome_fornecedor.ilike(f"%{filtros['fornecedor']}%"))
        if filtros.get('nf'):
            query = query.filter(Conferencia.numero_nota_fiscal.ilike(f"%{filtros['nf']}%"))
        if filtros.get('dataInicio'):
            # Garante que a data de finalização não seja nula antes de comparar
            query = query.filter(Conferencia.data_finalizacao.isnot(None), Conferencia.data_finalizacao >= filtros['dataInicio'])
        if filtros.get('dataFim'):
            # Garante que a data de finalização não seja nula antes de comparar
            query = query.filter(Conferencia.data_finalizacao.isnot(None), Conferencia.data_finalizacao <= filtros['dataFim'] + 'T23:59:59')

        pagination = query.order_by(Conferencia.data_finalizacao.desc()).paginate(page=page + 1, per_page=limit, error_out=False)
        
        return jsonify({
            'conferencias': [serialize_conferencia(c) for c in pagination.items],
            'temMais': pagination.has_next
        })
    except Exception as e:
        print(f"ERRO AO BUSCAR HISTÓRICO DE CONFERÊNCIAS: {e}")
        return jsonify({"error": str(e)}), 500
# --- FIM DA CORREÇÃO ---


# --- ROTAS DE APOIO (CRUD) ---
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
        status='Em Conferência', 
        data_inicio_conferencia=now_iso,
        conferentes=[editor_nome] 
    )

    db.session.add(novo_recebimento)
    db.session.commit()
    
    registrar_log(novo_recebimento.id, editor_nome, 'RECEBIMENTO_RUA_CRIADO', log_type='conferencias')

    return finalizar_conferencia_logica(novo_recebimento.id)

@conferencias_bp.route('/recentes', methods=['GET'])
def get_recebimentos_recentes():
    recentes = Conferencia.query.order_by(Conferencia.data_recebimento.desc()).limit(200).all()
    return jsonify([serialize_conferencia(c) for c in recentes])