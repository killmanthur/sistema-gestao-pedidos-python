# quadro_app/blueprints/conferencias.py
from flask import Blueprint, request, jsonify
from datetime import datetime
from sqlalchemy import or_
from ..extensions import db, tz_cuiaba
from quadro_app.models import Conferencia, ItemExcluido, Usuario
from quadro_app.utils import registrar_log

conferencias_bp = Blueprint('conferencias', __name__, url_prefix='/api/conferencias')

def serialize_conferencia(c):
    """Converte um objeto Conferencia do SQLAlchemy em um dicionário para JSON."""
    if not c: return None
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
        'data_conferencia_finalizada': c.data_conferencia_finalizada,
        'data_finalizacao': c.data_finalizacao, 
        'conferentes': c.conferentes, 
        'observacoes': c.observacoes,
        'resolvido_gestor': c.resolvido_gestor, 
        'resolvido_contabilidade': c.resolvido_contabilidade,
        'conferente_nome': c.conferente_nome,
        'total_itens': c.total_itens
    }

# ==========================================
# 1. ROTAS DE RECEBIMENTO (TELA DE ENTRADA)
# ==========================================

@conferencias_bp.route('/recebimento', methods=['POST'])
def criar_recebimento():
    dados = request.get_json()
    editor_nome = dados.get('editor_nome', 'Sistema')
    obs_inicial = dados.get('observacao', '')

    nova_conferencia = Conferencia(
        data_recebimento=datetime.now(tz_cuiaba).isoformat(),
        numero_nota_fiscal=dados.get('numero_nota_fiscal'),
        nome_fornecedor=dados.get('nome_fornecedor'),
        nome_transportadora=dados.get('nome_transportadora'),
        qtd_volumes=dados.get('qtd_volumes'),
        recebido_por=dados.get('recebido_por'),
        status='Aguardando Conferência'
    )

    if obs_inicial:
        nova_conferencia.observacoes = [{
            'texto': f"[OBS INICIAL] {obs_inicial}", 
            'autor': editor_nome,
            'timestamp': datetime.now(tz_cuiaba).isoformat()
        }]

    db.session.add(nova_conferencia)
    db.session.commit()
    registrar_log(nova_conferencia.id, editor_nome, 'RECEBIMENTO_CRIADO', log_type='conferencias')
    return jsonify({'status': 'success', 'id': nova_conferencia.id}), 201

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

@conferencias_bp.route('/recebimentos-paginados', methods=['POST'])
def get_recebimentos_paginados():
    try:
        dados = request.get_json() or {}
        page = dados.get('page', 0)
        limit = dados.get('limit', 50)
        search_term = dados.get('search', '').lower().strip()
        data_inicio = dados.get('dataInicio')
        data_fim = dados.get('dataFim')
        status_filter = dados.get('status')

        query = Conferencia.query

        if status_filter:
            if status_filter == 'Pendente':
                query = query.filter(Conferencia.status.ilike('%Pendente%'))
            else:
                query = query.filter(Conferencia.status == status_filter)

        if data_inicio:
            query = query.filter(Conferencia.data_recebimento >= data_inicio)
        if data_fim:
            query = query.filter(Conferencia.data_recebimento <= data_fim + 'T23:59:59')

        if search_term:
            query = query.filter(or_(
                Conferencia.numero_nota_fiscal.ilike(f'%{search_term}%'),
                Conferencia.nome_fornecedor.ilike(f'%{search_term}%'),
                Conferencia.vendedor_nome.ilike(f'%{search_term}%')
            ))

        pagination = query.order_by(Conferencia.data_recebimento.desc())\
                          .paginate(page=page + 1, per_page=limit, error_out=False)

        return jsonify({
            'recebimentos': [serialize_conferencia(c) for c in pagination.items],
            'temMais': pagination.has_next
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==========================================
# 2. ROTAS OPERACIONAIS (TELA DE CONFERÊNCIA)
# ==========================================

@conferencias_bp.route('/ativas', methods=['GET'])
def get_conferencias_ativas():
    status_operacionais = ['Aguardando Conferência', 'Em Conferência']
    itens = Conferencia.query.filter(Conferencia.status.in_(status_operacionais))\
        .order_by(Conferencia.data_recebimento.desc()).all()
    return jsonify([serialize_conferencia(c) for c in itens])

@conferencias_bp.route('/<int:conferencia_id>/iniciar', methods=['PUT'])
def iniciar_conferencia(conferencia_id):
    dados = request.get_json()
    conferentes = dados.get('conferentes')
    total_itens = dados.get('total_itens', 0)
    editor_nome = dados.get('editor_nome', 'N/A')
    
    conferencia = Conferencia.query.get_or_404(conferencia_id)
    conferencia.status = 'Em Conferência'
    conferencia.data_inicio_conferencia = datetime.now(tz_cuiaba).isoformat()
    conferencia.conferentes = conferentes
    conferencia.total_itens = total_itens
    db.session.commit()
    
    registrar_log(conferencia_id, editor_nome, 'INICIO_CONFERENCIA', log_type='conferencias')
    return jsonify({'status': 'success'})

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

    conferencia.data_conferencia_finalizada = datetime.now(tz_cuiaba).isoformat()

    if tem_pendencia_fornecedor and solicita_alteracao:
        conferencia.status = 'Pendente (Ambos)'
    elif tem_pendencia_fornecedor:
        conferencia.status = 'Pendente (Fornecedor)'
    elif solicita_alteracao:
        conferencia.status = 'Pendente (Alteração)'
    else:
        conferencia.status = 'Finalizado'
        conferencia.data_finalizacao = conferencia.data_conferencia_finalizada
    
    conferencia.resolvido_gestor = not tem_pendencia_fornecedor
    conferencia.resolvido_contabilidade = not solicita_alteracao
    
    if observacao:
        obs_atuais = conferencia.observacoes or []
        obs_atuais.append({
            'texto': f"[DIVERGÊNCIA] {observacao}", 
            'autor': editor_nome,
            'timestamp': datetime.now(tz_cuiaba).isoformat()
        })
        conferencia.observacoes = list(obs_atuais)

    db.session.commit()
    registrar_log(conferencia_id, editor_nome, f'FINALIZADO_COMO_{conferencia.status.upper()}', detalhes={'info': observacao}, log_type='conferencias')
    return jsonify({'status': 'success'})

# ==========================================
# 3. GESTÃO DE PENDÊNCIAS E ALTERAÇÕES
# ==========================================

@conferencias_bp.route('/pendentes-e-resolvidas', methods=['GET'])
def get_pendentes_e_resolvidas():
    status_relevantes = ['Pendente (Fornecedor)', 'Pendente (Alteração)', 'Pendente (Ambos)']
    itens = Conferencia.query.filter(Conferencia.status.in_(status_relevantes))\
        .order_by(Conferencia.data_recebimento.desc()).all()
    return jsonify([serialize_conferencia(c) for c in itens])

@conferencias_bp.route('/<int:conferencia_id>/resolver-item', methods=['PUT'])
def resolver_item_pendencia(conferencia_id):
    dados = request.get_json()
    editor_nome = dados.get('editor_nome', 'N/A')
    user_role = dados.get('user_role')
    observacao = dados.get('observacao')
    conferencia = Conferencia.query.get_or_404(conferencia_id)

    if not observacao or not observacao.strip():
        return jsonify({'error': 'A observação é obrigatória.'}), 400

    log_acao = ''
    if user_role in ['Admin', 'Estoque']:
        conferencia.resolvido_gestor = True
        log_acao = 'PENDENCIA_FORNECEDOR_RESOLVIDA'
    elif user_role in ['Contabilidade', 'Admin']:
        conferencia.resolvido_contabilidade = True
        log_acao = 'ALTERACAO_CONTABILIDADE_RESOLVIDA'
    else:
        return jsonify({'error': 'Permissão negada.'}), 403

    if conferencia.resolvido_gestor and conferencia.resolvido_contabilidade:
        conferencia.status = 'Finalizado'
        conferencia.data_finalizacao = datetime.now(tz_cuiaba).isoformat()

    obs_atuais = conferencia.observacoes or []
    obs_atuais.append({
        'texto': f"[RESOLVIDO] {observacao}", 
        'autor': editor_nome,
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
    texto = dados.get('texto', '')
    conferencia = Conferencia.query.get_or_404(conferencia_id)
    obs_atuais = conferencia.observacoes or []
    obs_atuais.append({'texto': texto, 'autor': editor_nome, 'timestamp': datetime.now(tz_cuiaba).isoformat()})
    conferencia.observacoes = list(obs_atuais)
    db.session.commit()
    return jsonify({'status': 'success'})

# ==========================================
# 4. HISTÓRICO DE CONFERÊNCIAS
# ==========================================

@conferencias_bp.route('/historico', methods=['POST'])
def get_historico_conferencias():
    try:
        filtros = request.get_json() or {}
        page = filtros.get('page', 0)
        limit = filtros.get('limit', 20)
        query = Conferencia.query.filter_by(status='Finalizado')

        if filtros.get('fornecedor'):
            query = query.filter(Conferencia.nome_fornecedor.ilike(f"%{filtros['fornecedor']}%"))
        if filtros.get('nf'):
            query = query.filter(Conferencia.numero_nota_fiscal.ilike(f"%{filtros['nf']}%"))
        if filtros.get('dataInicio'):
            query = query.filter(Conferencia.data_finalizacao >= filtros['dataInicio'])
        if filtros.get('dataFim'):
            query = query.filter(Conferencia.data_finalizacao <= filtros['dataFim'] + 'T23:59:59')

        pagination = query.order_by(Conferencia.data_finalizacao.desc()).paginate(page=page + 1, per_page=limit, error_out=False)
        return jsonify({'conferencias': [serialize_conferencia(c) for c in pagination.items], 'temMais': pagination.has_next})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@conferencias_bp.route('/<int:conferencia_id>/reiniciar', methods=['PUT'])
def reiniciar_conferencia(conferencia_id):
    dados = request.get_json()
    autor, motivo = dados.get('autor'), dados.get('motivo')
    conferencia = Conferencia.query.get_or_404(conferencia_id)
    conferencia.status = 'Em Conferência'
    conferencia.data_finalizacao = None
    conferencia.data_conferencia_finalizada = None 
    conferencia.resolvido_gestor = False
    conferencia.resolvido_contabilidade = False
    obs_atuais = conferencia.observacoes or []
    obs_atuais.append({'texto': f"[REINICIADO] {motivo}", 'autor': autor, 'timestamp': datetime.now(tz_cuiaba).isoformat()})
    conferencia.observacoes = list(obs_atuais)
    db.session.commit()
    registrar_log(conferencia_id, autor, 'CONFERENCIA_REINICIADA', detalhes={'info': motivo}, log_type='conferencias')
    return jsonify({'status': 'success'})

# ==========================================
# 5. AUXILIARES E CRUD
# ==========================================

@conferencias_bp.route('/<int:conferencia_id>', methods=['GET'])
def get_conferencia_detalhes(conferencia_id):
    c = Conferencia.query.get_or_404(conferencia_id)
    return jsonify(serialize_conferencia(c))

@conferencias_bp.route('/<int:conferencia_id>', methods=['PUT'])
def editar_conferencia(conferencia_id):
    dados = request.get_json()
    editor_nome = dados.pop('editor_nome', 'N/A')
    conferencia = Conferencia.query.get_or_404(conferencia_id)
    for key, value in dados.items():
        if hasattr(conferencia, key): setattr(conferencia, key, value)
    db.session.commit()
    registrar_log(conferencia_id, editor_nome, 'EDICAO_DADOS_NF', log_type='conferencias')
    return jsonify({'status': 'success'})

@conferencias_bp.route('/<int:conferencia_id>', methods=['DELETE'])
def deletar_conferencia(conferencia_id):
    editor_nome = request.json.get('editor_nome', 'N/A')
    conferencia = Conferencia.query.get_or_404(conferencia_id)
    db.session.add(ItemExcluido(tipo_item='Conferencia', item_id_original=str(conferencia.id), dados_item=serialize_conferencia(conferencia), excluido_por=editor_nome, data_exclusao=datetime.now(tz_cuiaba).isoformat()))
    db.session.delete(conferencia)
    db.session.commit()
    return jsonify({'status': 'success'})

@conferencias_bp.route('/dashboard-data', methods=['POST'])
def get_dashboard_conferencia_data():
    filtros = request.get_json() or {}
    data_inicio = filtros.get('dataInicio')
    data_fim = filtros.get('dataFim')
    try:
        query = Conferencia.query.filter(Conferencia.data_conferencia_finalizada.isnot(None))
        if data_inicio: query = query.filter(Conferencia.data_conferencia_finalizada >= data_inicio)
        if data_fim: query = query.filter(Conferencia.data_conferencia_finalizada <= data_fim + 'T23:59:59')
        conferencias = query.all()
        conferente_stats, fornecedor_stats = {}, {}
        for conf in conferencias:
            forn_nome = conf.nome_fornecedor or "N/A"
            f_stats = fornecedor_stats.setdefault(forn_nome, {'nome': forn_nome, 'count': 0, 'volumes': 0, 'divergencias': 0})
            f_stats['count'] += 1
            f_stats['volumes'] += (conf.qtd_volumes or 0)
            if conf.status.startswith('Pendente'): f_stats['divergencias'] += 1
            
            c_list = conf.conferentes or []
            num = len(c_list)
            if num > 0:
                for nome in c_list:
                    c_stats = conferente_stats.setdefault(nome, {'nome': nome, 'count': 0, 'volumes': 0, 'total_itens': 0, 'total_seconds': 0, 'items_for_avg': 0})
                    c_stats['count'] += 1
                    c_stats['volumes'] += (conf.qtd_volumes or 0) / num
                    c_stats['total_itens'] += (conf.total_itens or 0) / num
        
        return jsonify({
            'conferentes': sorted(conferente_stats.values(), key=lambda x: x['count'], reverse=True),
            'fornecedores': sorted(fornecedor_stats.values(), key=lambda x: x['count'], reverse=True)
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500