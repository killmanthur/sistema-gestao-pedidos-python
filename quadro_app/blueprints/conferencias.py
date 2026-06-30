# quadro_app/blueprints/conferencias.py
from flask import Blueprint, request, jsonify
from datetime import datetime, timedelta
from sqlalchemy import or_, cast, String
from ..extensions import db, tz_cuiaba
from quadro_app.models import Conferencia, ItemExcluido, Usuario
from quadro_app.utils import registrar_log, criar_notificacao
from quadro_app import socketio

conferencias_bp = Blueprint('conferencias', __name__, url_prefix='/api/conferencias')

# Status que representam uma conferência que ainda precisa de atenção na aba
# "Pendências e Alterações".
STATUS_PENDENTES = ['Pendente (Fornecedor)', 'Pendente (Alteração)', 'Pendente (Ambos)']


def _destinatarios_pendencia():
    """Usuários que enxergam a aba Pendências (Admin ou com a página liberada).
    São quem recebe o sino/som e quem vê a badge no menu.

    accessible_pages é coluna JSON; o filtro é feito em Python para não depender
    de operadores JSON do SQLite."""
    return [
        u for u in Usuario.query.all()
        if u.role == 'Admin' or (u.accessible_pages and 'pendencias_e_alteracoes' in u.accessible_pages)
    ]


def _assinatura_pendencia(c):
    """Assinatura de atividade de uma pendência. Muda quando há atualização de
    status ou uma nova observação/adição — fazendo a badge 'reacender' mesmo
    para uma pendência já vista."""
    n_obs = len(c.observacoes or [])
    return f"{c.status}|{n_obs}"


def _pendencia_items():
    """Lista [{id, v}] das conferências pendentes; v = assinatura de atividade.
    O cliente compara com o que já viu para decidir o que ainda é 'novo'."""
    pendentes = Conferencia.query.filter(Conferencia.status.in_(STATUS_PENDENTES)).all()
    return [{'id': c.id, 'v': _assinatura_pendencia(c)} for c in pendentes]


def _contar_pendencias():
    return Conferencia.query.filter(Conferencia.status.in_(STATUS_PENDENTES)).count()


def _emitir_pendencias_atualizado():
    """Avisa todos os clientes para recalcularem a badge do menu."""
    items = _pendencia_items()
    socketio.emit('pendencias_atualizado', {'count': len(items), 'items': items})


def _notificar_pendencia(conferencia, msg, actor_nome):
    """Cria notificação (sino + som + nativa) para os responsáveis, exceto para
    quem fez o movimento, e atualiza a badge de todos."""
    for usuario in _destinatarios_pendencia():
        if usuario.nome and usuario.nome == actor_nome:
            continue
        criar_notificacao(usuario.id, msg, link='/pendencias-e-alteracoes')
    _emitir_pendencias_atualizado()


def _notificar_nova_pendencia(conferencia, tem_pendencia_fornecedor, solicita_alteracao, editor_nome):
    """Notifica quando uma conferência vira pendência/alteração."""
    if tem_pendencia_fornecedor and solicita_alteracao:
        msg = f"Nova pendência (fornecedor + alteração) — NF {conferencia.numero_nota_fiscal} ({conferencia.nome_fornecedor})"
    elif tem_pendencia_fornecedor:
        msg = f"Nova pendência de fornecedor — NF {conferencia.numero_nota_fiscal} ({conferencia.nome_fornecedor})"
    else:
        msg = f"Nova solicitação de alteração — NF {conferencia.numero_nota_fiscal} ({conferencia.nome_fornecedor})"
    _notificar_pendencia(conferencia, msg, editor_nome)

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
        'total_itens': c.total_itens,
        'prioridade': c.prioridade,
        'prioridade_definida_em': c.prioridade_definida_em
    }

# Prioridades válidas no Kanban (inclui 'A definir' e as 4 prioridades).
PRIORIDADES = ['A definir', 'Prioridade 1', 'Prioridade 2', 'Prioridade 3', 'Prioridade 4']
# Prioridades "reais" que aparecem na TV (sem 'A definir').
PRIORIDADES_TV = ['Prioridade 1', 'Prioridade 2', 'Prioridade 3', 'Prioridade 4']
# Cadeia de escalonamento, da MENOS para a MAIS urgente. Após 48h, a nota sobe
# um nível (em direção à Prioridade 1), priorizando as notas mais antigas.
ESCALA = ['Prioridade 4', 'Prioridade 3', 'Prioridade 2', 'Prioridade 1']
HORAS_ESCALONAMENTO = 48
# Status de um recebimento que ainda está "em jogo" (aparece no Kanban/TV).
STATUS_OPERACIONAIS = ['Aguardando Conferência', 'Em Conferência']


def _escalar_prioridades_vencidas():
    """Sobe automaticamente de nível as notas cuja prioridade ATUAL passou de
    48h (cada janela de 48h vale 1 nível). 'A definir' e 'Prioridade 1' não
    escalonam. Retorna True se algo mudou (para emitir atualização)."""
    agora = datetime.now(tz_cuiaba)
    candidatas = Conferencia.query.filter(
        Conferencia.prioridade.in_(['Prioridade 2', 'Prioridade 3', 'Prioridade 4']),
        Conferencia.status.in_(STATUS_OPERACIONAIS),
        Conferencia.prioridade_definida_em.isnot(None),
    ).all()

    mudou = False
    for c in candidatas:
        try:
            definido = datetime.fromisoformat(c.prioridade_definida_em)
        except (ValueError, TypeError):
            continue
        horas = (agora - definido).total_seconds() / 3600
        niveis = int(horas // HORAS_ESCALONAMENTO)
        if niveis < 1:
            continue
        idx = ESCALA.index(c.prioridade)
        novo_idx = min(len(ESCALA) - 1, idx + niveis)   # avança em direção à P1
        if novo_idx == idx:
            continue
        c.prioridade = ESCALA[novo_idx]
        c.prioridade_definida_em = agora.isoformat()
        mudou = True

    if mudou:
        db.session.commit()
    return mudou

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
        status='Aguardando Conferência',
        prioridade='A definir'
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
    socketio.emit('novo_recebimento', {'recebimento': serialize_conferencia(nova_conferencia)})

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
        conferentes=[editor_nome],
        prioridade='A definir'
    )

    db.session.add(novo_recebimento)
    db.session.commit()
    registrar_log(novo_recebimento.id, editor_nome, 'RECEBIMENTO_RUA_CRIADO', log_type='conferencias')
    socketio.emit('novo_recebimento', {'recebimento': serialize_conferencia(novo_recebimento)})
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
    socketio.emit('conferencia_iniciada', {'conferencia': serialize_conferencia(conferencia)})
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
    socketio.emit('conferencia_finalizada', {'conferencia': serialize_conferencia(conferencia)})

    # Avisa os responsáveis (sino + som + badge) quando surge pendência/alteração.
    if tem_pendencia_fornecedor or solicita_alteracao:
        _notificar_nova_pendencia(conferencia, tem_pendencia_fornecedor, solicita_alteracao, editor_nome)

    return jsonify({'status': 'success'})

# ==========================================
# 2.1. GESTÃO DE PRIORIDADE (KANBAN + TV)
# ==========================================

@conferencias_bp.route('/prioridades/kanban', methods=['GET'])
def get_prioridades_kanban():
    """Recebimentos NOVOS (prioridade != NULL) ainda não finalizados, para o
    Kanban do gerente de estoque. Legados (prioridade NULL) ficam de fora."""
    if _escalar_prioridades_vencidas():
        socketio.emit('prioridade_atualizada', {})
    itens = Conferencia.query.filter(
        Conferencia.prioridade.isnot(None),
        Conferencia.status.in_(STATUS_OPERACIONAIS)
    ).order_by(Conferencia.data_recebimento.desc()).all()
    return jsonify([serialize_conferencia(c) for c in itens])


@conferencias_bp.route('/prioridades/tv', methods=['GET'])
def get_prioridades_tv():
    """Recebimentos com prioridade DEFINIDA (1/2/3/4) e ainda não finalizados.
    Ordem: primeiro os que aguardam (por prioridade, do mais antigo p/ o mais
    novo); por último os que já estão EM CONFERÊNCIA (vão para o fim da fila)."""
    if _escalar_prioridades_vencidas():
        socketio.emit('prioridade_atualizada', {})
    itens = Conferencia.query.filter(
        Conferencia.prioridade.in_(PRIORIDADES_TV),
        Conferencia.status.in_(STATUS_OPERACIONAIS)
    ).all()

    def chave(c):
        em_conf = 1 if c.status == 'Em Conferência' else 0   # em conferência vai pro fim
        return (em_conf, PRIORIDADES_TV.index(c.prioridade), c.data_recebimento or '')

    itens.sort(key=chave)
    return jsonify([serialize_conferencia(c) for c in itens])


@conferencias_bp.route('/<int:conferencia_id>/prioridade', methods=['PUT'])
def definir_prioridade(conferencia_id):
    dados = request.get_json() or {}
    nova = dados.get('prioridade')
    editor_nome = dados.get('editor_nome', 'N/A')
    if nova not in PRIORIDADES:
        return jsonify({'error': 'Prioridade inválida.'}), 400

    conferencia = Conferencia.query.get_or_404(conferencia_id)
    conferencia.prioridade = nova
    # Marca o início da janela de 48h (só p/ prioridades reais; 'A definir' não escalona).
    conferencia.prioridade_definida_em = (
        datetime.now(tz_cuiaba).isoformat() if nova in PRIORIDADES_TV else None
    )
    db.session.commit()
    registrar_log(conferencia_id, editor_nome, 'PRIORIDADE_DEFINIDA',
                  detalhes={'info': nova}, log_type='conferencias')
    socketio.emit('prioridade_atualizada', {'conferencia': serialize_conferencia(conferencia)})
    return jsonify({'status': 'success'})


# ==========================================
# 3. GESTÃO DE PENDÊNCIAS E ALTERAÇÕES
# ==========================================

@conferencias_bp.route('/pendentes-e-resolvidas', methods=['GET'])
def get_pendentes_e_resolvidas():
    itens = Conferencia.query.filter(Conferencia.status.in_(STATUS_PENDENTES))\
        .order_by(Conferencia.data_recebimento.desc()).all()
    return jsonify([serialize_conferencia(c) for c in itens])

@conferencias_bp.route('/pendencias-count', methods=['GET'])
def get_pendencias_count():
    """Itens (id + assinatura de atividade) das pendências — usado pela badge do menu."""
    items = _pendencia_items()
    return jsonify({'count': len(items), 'items': items})

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
    socketio.emit('item_pendencia_resolvido', {'conferencia': serialize_conferencia(conferencia)})

    # Notifica os responsáveis (exceto quem agiu): finalização ou atualização de status.
    nf = conferencia.numero_nota_fiscal
    if conferencia.status == 'Finalizado':
        msg = f"Pendência finalizada — NF {nf} ({conferencia.nome_fornecedor}) por {editor_nome}"
    else:
        msg = f"Pendência atualizada — NF {nf} ({conferencia.nome_fornecedor}) por {editor_nome}"
    _notificar_pendencia(conferencia, msg, editor_nome)
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
    socketio.emit('observacao_adicionada', {'conferencia_id': conferencia_id, 'observacao': obs_atuais[-1]})

    # Nova adição numa pendência: notifica os responsáveis (exceto o autor).
    if conferencia.status in STATUS_PENDENTES:
        msg = f"Nova atualização na pendência — NF {conferencia.numero_nota_fiscal} ({conferencia.nome_fornecedor}) por {editor_nome}"
        _notificar_pendencia(conferencia, msg, editor_nome)
    return jsonify({'status': 'success'})


# Prefixos de observações geradas pelo sistema — não editáveis.
_PREFIXOS_SISTEMA = ('[RESOLVIDO]', '[DIVERGÊNCIA]', '[OBS INICIAL]')


@conferencias_bp.route('/<int:conferencia_id>/observacao/<int:indice>', methods=['PUT'])
def editar_observacao(conferencia_id, indice):
    """Edita o texto de UMA observação (identificada pelo índice na lista).
    Só observações comuns (sem prefixo de sistema) podem ser editadas."""
    dados = request.get_json() or {}
    novo_texto = (dados.get('texto') or '').strip()
    editor_nome = dados.get('autor', 'N/A')
    if not novo_texto:
        return jsonify({'error': 'O texto não pode ficar vazio.'}), 400

    conferencia = Conferencia.query.get_or_404(conferencia_id)
    obs_atuais = list(conferencia.observacoes or [])
    if indice < 0 or indice >= len(obs_atuais):
        return jsonify({'error': 'Observação não encontrada.'}), 404

    texto_atual = (obs_atuais[indice].get('texto') or '').strip()
    if texto_atual.startswith(_PREFIXOS_SISTEMA):
        return jsonify({'error': 'Esta observação é do sistema e não pode ser editada.'}), 403

    obs_atuais[indice]['texto'] = novo_texto
    obs_atuais[indice]['editado_em'] = datetime.now(tz_cuiaba).isoformat()
    obs_atuais[indice]['editado_por'] = editor_nome
    conferencia.observacoes = obs_atuais
    db.session.commit()
    registrar_log(conferencia_id, editor_nome, 'OBSERVACAO_EDITADA',
                  detalhes={'info': novo_texto}, log_type='conferencias')
    socketio.emit('observacao_adicionada', {'conferencia_id': conferencia_id})
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
        if filtros.get('apenas_resolvidas'):
            # Pendências resolvidas têm uma observação com prefixo [RESOLVIDO].
            # observacoes é JSON (texto no SQLite); LIKE no texto serializado funciona.
            query = query.filter(cast(Conferencia.observacoes, String).like('%[RESOLVIDO]%'))

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
    socketio.emit('conferencia_reiniciada', {'conferencia': serialize_conferencia(conferencia)})
    _emitir_pendencias_atualizado()
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
    socketio.emit('conferencia_editada', {'conferencia': serialize_conferencia(conferencia)})
    return jsonify({'status': 'success'})

@conferencias_bp.route('/<int:conferencia_id>', methods=['DELETE'])
def deletar_conferencia(conferencia_id):
    editor_nome = request.json.get('editor_nome', 'N/A')
    conferencia = Conferencia.query.get_or_404(conferencia_id)
    db.session.add(ItemExcluido(tipo_item='Conferencia', item_id_original=str(conferencia.id), dados_item=serialize_conferencia(conferencia), excluido_por=editor_nome, data_exclusao=datetime.now(tz_cuiaba).isoformat()))
    db.session.delete(conferencia)
    db.session.commit()
    socketio.emit('conferencia_deletada', {'conferencia_id': conferencia_id})
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
                # Distribui volumes e itens em valores inteiros (mesma regra do
                # dashboard de separação): cada conferente recebe a parte inteira
                # e o resto é distribuído de um em um, evitando dízimas quebradas.
                vol_total = conf.qtd_volumes or 0
                itens_total = conf.total_itens or 0
                base_vol, resto_vol = divmod(vol_total, num)
                base_itens, resto_itens = divmod(itens_total, num)
                for i, nome in enumerate(c_list):
                    c_stats = conferente_stats.setdefault(nome, {'nome': nome, 'count': 0, 'volumes': 0, 'total_itens': 0, 'total_seconds': 0, 'items_for_avg': 0})
                    c_stats['count'] += 1
                    c_stats['volumes'] += base_vol + (1 if i < resto_vol else 0)
                    c_stats['total_itens'] += base_itens + (1 if i < resto_itens else 0)

        # Garante valores inteiros na saída, igual ao dashboard de separação.
        for data in conferente_stats.values():
            data['volumes'] = round(data['volumes'])
            data['total_itens'] = round(data['total_itens'])

        return jsonify({
            'conferentes': sorted(conferente_stats.values(), key=lambda x: x['count'], reverse=True),
            'fornecedores': sorted(fornecedor_stats.values(), key=lambda x: x['count'], reverse=True)
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ==========================================
# 6. MONITOR DE ESCALONAMENTO (background)
# ==========================================

def iniciar_monitor_prioridades(app):
    """Inicia um loop em segundo plano que, a cada 15 min, sobe de nível as
    notas cuja prioridade passou de 48h e avisa as telas (Kanban + TV)."""
    def _loop():
        while True:
            socketio.sleep(900)   # 15 minutos
            try:
                with app.app_context():
                    if _escalar_prioridades_vencidas():
                        socketio.emit('prioridade_atualizada', {})
            except Exception as e:
                print(f"[monitor_prioridades] erro: {e}")

    socketio.start_background_task(_loop)