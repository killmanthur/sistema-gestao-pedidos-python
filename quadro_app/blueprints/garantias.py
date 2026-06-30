# quadro_app/blueprints/garantias.py
from flask import Blueprint, request, jsonify, session
from datetime import datetime, date
from ..extensions import db, tz_cuiaba
from quadro_app.models import Garantia, Usuario, ItemExcluido
from quadro_app.utils import registrar_log
from quadro_app import socketio

garantias_bp = Blueprint('garantias', __name__, url_prefix='/api/garantias')

# Permissões (páginas). 'garantias' = aba de pendentes (cadastro/edição),
# 'garantias_finalizadas' = aba de finalizadas (visualizar/reabrir).
PAGE_PENDENTES = 'garantias'
PAGE_FINALIZADAS = 'garantias_finalizadas'

STATUS_PENDENTE = 'Pendente'
STATUS_FINAIS = {'Recusada', 'Concedida', 'Abandono'}
STATUS_VALIDOS = {STATUS_PENDENTE} | STATUS_FINAIS


def _usuario_atual():
    uid = session.get('user_id')
    if not uid:
        return None
    return Usuario.query.get(uid)


def _pode(u, page_key):
    if not u:
        return False
    return u.role == 'Admin' or (u.accessible_pages and page_key in u.accessible_pages)


def _agora_iso():
    return datetime.now(tz_cuiaba).isoformat()


def _hoje():
    return datetime.now(tz_cuiaba).strftime('%Y-%m-%d')


def _parse_data(valor):
    """Converte 'YYYY-MM-DD' em date; retorna None se inválida/vazia."""
    if not valor:
        return None
    try:
        return datetime.strptime(str(valor)[:10], '%Y-%m-%d').date()
    except (TypeError, ValueError):
        return None


def _calcular_tempo(g):
    """Dias decorridos do início até a data final (ou hoje, se pendente)."""
    inicio = _parse_data(g.data_inicio)
    if not inicio:
        return None
    fim = _parse_data(g.data_final) if g.status in STATUS_FINAIS else None
    if not fim:
        fim = date.today()
    dias = (fim - inicio).days
    return dias if dias >= 0 else 0


def serialize(g):
    dias = _calcular_tempo(g)
    if dias is None:
        tempo_label = '-'
    elif dias == 0:
        tempo_label = 'Hoje'
    elif dias == 1:
        tempo_label = '1 dia'
    else:
        tempo_label = f'{dias} dias'
    return {
        'id': g.id,
        'nome_cliente': g.nome_cliente or '',
        'descricao_peca': g.descricao_peca or '',
        'codigo_peca': g.codigo_peca or '',
        'marca': g.marca or '',
        'fornecedor': g.fornecedor or '',
        'defeito': g.defeito or '',
        'quantidade': g.quantidade or 1,
        'data_inicio': g.data_inicio or '',
        'data_envio_fornecedor': g.data_envio_fornecedor or '',
        'ultimo_contato': g.ultimo_contato or '',
        'data_final': g.data_final or '',
        'acompanhamento': g.acompanhamento or [],
        'conclusao': g.conclusao or '',
        'status': g.status,
        'tempo_decorrido_dias': dias,
        'tempo_decorrido': tempo_label,
        'criado_por': g.criado_por or '',
        'data_criacao': g.data_criacao or '',
        'atualizado_em': g.atualizado_em or '',
        'finalizado_por': g.finalizado_por or '',
        'finalizado_em': g.finalizado_em or '',
    }


def _aplicar_campos(g, dados):
    """Preenche/atualiza os campos principais a partir do payload."""
    g.nome_cliente = (dados.get('nome_cliente') or '').strip()
    g.descricao_peca = (dados.get('descricao_peca') or '').strip()
    g.codigo_peca = (dados.get('codigo_peca') or '').strip()
    g.marca = (dados.get('marca') or '').strip()
    g.fornecedor = (dados.get('fornecedor') or '').strip()
    g.defeito = (dados.get('defeito') or '').strip()
    try:
        g.quantidade = max(1, int(dados.get('quantidade') or 1))
    except (TypeError, ValueError):
        g.quantidade = 1
    g.data_inicio = (dados.get('data_inicio') or '').strip() or _hoje()
    g.data_envio_fornecedor = (dados.get('data_envio_fornecedor') or '').strip()
    # 'ultimo_contato' não é editado manualmente: é atualizado automaticamente
    # quando um acompanhamento é registrado.


@garantias_bp.route('', methods=['GET'])
def listar():
    """Lista as garantias de uma aba.
    ?aba=pendentes (padrão) | finalizadas
    """
    u = _usuario_atual()
    aba = (request.args.get('aba') or 'pendentes').lower()

    if aba == 'finalizadas':
        if not _pode(u, PAGE_FINALIZADAS):
            return jsonify({'error': 'Acesso restrito.'}), 403
        query = Garantia.query.filter(Garantia.status.in_(list(STATUS_FINAIS)))\
            .order_by(Garantia.finalizado_em.desc(), Garantia.id.desc())
    else:
        if not _pode(u, PAGE_PENDENTES):
            return jsonify({'error': 'Acesso restrito.'}), 403
        query = Garantia.query.filter(Garantia.status == STATUS_PENDENTE)\
            .order_by(Garantia.id.desc())

    registros = query.all()
    return jsonify({
        'registros': [serialize(g) for g in registros],
        'pode_editar': _pode(u, PAGE_PENDENTES),
        'pode_reabrir': _pode(u, PAGE_FINALIZADAS),
    })


@garantias_bp.route('/<int:garantia_id>', methods=['GET'])
def obter(garantia_id):
    u = _usuario_atual()
    if not (_pode(u, PAGE_PENDENTES) or _pode(u, PAGE_FINALIZADAS)):
        return jsonify({'error': 'Acesso restrito.'}), 403
    g = Garantia.query.get_or_404(garantia_id)
    return jsonify(serialize(g))


@garantias_bp.route('', methods=['POST'])
def criar():
    u = _usuario_atual()
    if not _pode(u, PAGE_PENDENTES):
        return jsonify({'error': 'Acesso restrito.'}), 403

    dados = request.get_json() or {}
    if not (dados.get('nome_cliente') or '').strip():
        return jsonify({'error': 'O nome do cliente é obrigatório.'}), 400
    if not (dados.get('codigo_peca') or '').strip():
        return jsonify({'error': 'O código da peça é obrigatório.'}), 400

    g = Garantia(status=STATUS_PENDENTE, acompanhamento=[])
    _aplicar_campos(g, dados)
    g.criado_por = u.nome if u else 'Sistema'
    g.data_criacao = _agora_iso()
    g.atualizado_em = g.data_criacao

    db.session.add(g)
    db.session.commit()
    registrar_log(g.id, g.criado_por, 'GARANTIA_CRIADA',
                  detalhes={'cliente': g.nome_cliente, 'codigo': g.codigo_peca},
                  log_type='garantias')
    socketio.emit('garantias_atualizado')
    return jsonify({'status': 'success', 'registro': serialize(g)}), 201


@garantias_bp.route('/<int:garantia_id>', methods=['PUT'])
def editar(garantia_id):
    u = _usuario_atual()
    if not _pode(u, PAGE_PENDENTES):
        return jsonify({'error': 'Acesso restrito.'}), 403

    g = Garantia.query.get_or_404(garantia_id)
    dados = request.get_json() or {}
    if not (dados.get('nome_cliente') or '').strip():
        return jsonify({'error': 'O nome do cliente é obrigatório.'}), 400
    if not (dados.get('codigo_peca') or '').strip():
        return jsonify({'error': 'O código da peça é obrigatório.'}), 400

    _aplicar_campos(g, dados)
    # Conclusão é editável a qualquer momento (útil ao revisar finalizadas).
    if 'conclusao' in dados:
        g.conclusao = (dados.get('conclusao') or '').strip()
    g.atualizado_em = _agora_iso()

    db.session.commit()
    socketio.emit('garantias_atualizado')
    return jsonify({'status': 'success', 'registro': serialize(g)})


@garantias_bp.route('/<int:garantia_id>/acompanhamento', methods=['POST'])
def adicionar_acompanhamento(garantia_id):
    u = _usuario_atual()
    if not _pode(u, PAGE_PENDENTES):
        return jsonify({'error': 'Acesso restrito.'}), 403

    g = Garantia.query.get_or_404(garantia_id)
    dados = request.get_json() or {}
    texto = (dados.get('texto') or '').strip()
    if not texto:
        return jsonify({'error': 'O texto do acompanhamento é obrigatório.'}), 400

    entradas = list(g.acompanhamento or [])
    nova = {
        'texto': texto,
        'autor': u.nome if u else 'Sistema',
        'timestamp': _agora_iso(),
    }
    entradas.append(nova)
    g.acompanhamento = entradas
    # Novo acompanhamento conta como contato: atualiza "último contato".
    g.ultimo_contato = _hoje()
    g.atualizado_em = nova['timestamp']

    db.session.commit()
    registrar_log(g.id, nova['autor'], 'GARANTIA_ACOMPANHAMENTO',
                  detalhes={'texto': texto}, log_type='garantias')
    socketio.emit('garantias_atualizado')
    return jsonify({'status': 'success', 'registro': serialize(g)})


@garantias_bp.route('/<int:garantia_id>/acompanhamento/<int:indice>', methods=['PUT'])
def editar_acompanhamento(garantia_id, indice):
    u = _usuario_atual()
    if not _pode(u, PAGE_PENDENTES):
        return jsonify({'error': 'Acesso restrito.'}), 403

    g = Garantia.query.get_or_404(garantia_id)
    entradas = list(g.acompanhamento or [])
    if indice < 0 or indice >= len(entradas):
        return jsonify({'error': 'Acompanhamento não encontrado.'}), 404

    dados = request.get_json() or {}
    texto = (dados.get('texto') or '').strip()
    if not texto:
        return jsonify({'error': 'O texto do acompanhamento é obrigatório.'}), 400

    entrada = dict(entradas[indice])
    entrada['texto'] = texto
    entrada['editado_em'] = _agora_iso()
    entrada['editado_por'] = u.nome if u else 'Sistema'
    entradas[indice] = entrada
    g.acompanhamento = entradas
    g.atualizado_em = entrada['editado_em']

    db.session.commit()
    socketio.emit('garantias_atualizado')
    return jsonify({'status': 'success', 'registro': serialize(g)})


@garantias_bp.route('/<int:garantia_id>/acompanhamento/<int:indice>', methods=['DELETE'])
def excluir_acompanhamento(garantia_id, indice):
    u = _usuario_atual()
    if not _pode(u, PAGE_PENDENTES):
        return jsonify({'error': 'Acesso restrito.'}), 403

    g = Garantia.query.get_or_404(garantia_id)
    entradas = list(g.acompanhamento or [])
    if indice < 0 or indice >= len(entradas):
        return jsonify({'error': 'Acompanhamento não encontrado.'}), 404

    entradas.pop(indice)
    g.acompanhamento = entradas
    g.atualizado_em = _agora_iso()
    db.session.commit()
    socketio.emit('garantias_atualizado')
    return jsonify({'status': 'success', 'registro': serialize(g)})


@garantias_bp.route('/<int:garantia_id>/status', methods=['PUT'])
def alterar_status(garantia_id):
    """Finaliza (Pendente -> Recusada/Concedida/Abandono) ou reabre
    (qualquer status final -> Pendente)."""
    u = _usuario_atual()
    g = Garantia.query.get_or_404(garantia_id)
    dados = request.get_json() or {}
    novo = (dados.get('status') or '').strip().capitalize()

    if novo not in STATUS_VALIDOS:
        return jsonify({'error': 'Status inválido.'}), 400

    reabrindo = novo == STATUS_PENDENTE
    # Reabrir exige permissão da aba de finalizadas; finalizar exige a de pendentes.
    if reabrindo:
        if not _pode(u, PAGE_FINALIZADAS):
            return jsonify({'error': 'Acesso restrito.'}), 403
    else:
        if not _pode(u, PAGE_PENDENTES):
            return jsonify({'error': 'Acesso restrito.'}), 403

    nome = u.nome if u else 'Sistema'
    anterior = g.status
    g.status = novo

    if reabrindo:
        # Volta a ser trabalhada: limpa marcas de finalização.
        g.data_final = ''
        g.finalizado_por = ''
        g.finalizado_em = ''
    else:
        # Finalização: registra desfecho e data final.
        g.data_final = (dados.get('data_final') or '').strip() or _hoje()
        if 'conclusao' in dados:
            g.conclusao = (dados.get('conclusao') or '').strip()
        g.finalizado_por = nome
        g.finalizado_em = _agora_iso()

    g.atualizado_em = _agora_iso()
    db.session.commit()
    registrar_log(g.id, nome, 'GARANTIA_STATUS',
                  detalhes={'de': anterior, 'para': novo}, log_type='garantias')
    socketio.emit('garantias_atualizado')
    return jsonify({'status': 'success', 'registro': serialize(g)})


def _dados_lixeira(g):
    """Snapshot apenas com colunas reais do modelo, para que a restauração
    pela lixeira funcione via Garantia(**dados_item)."""
    return {
        'id': g.id,
        'nome_cliente': g.nome_cliente,
        'descricao_peca': g.descricao_peca,
        'codigo_peca': g.codigo_peca,
        'marca': g.marca,
        'fornecedor': g.fornecedor,
        'defeito': g.defeito,
        'quantidade': g.quantidade,
        'data_inicio': g.data_inicio,
        'data_envio_fornecedor': g.data_envio_fornecedor,
        'ultimo_contato': g.ultimo_contato,
        'data_final': g.data_final,
        'acompanhamento': g.acompanhamento or [],
        'conclusao': g.conclusao,
        'status': g.status,
        'criado_por': g.criado_por,
        'data_criacao': g.data_criacao,
        'atualizado_em': g.atualizado_em,
        'finalizado_por': g.finalizado_por,
        'finalizado_em': g.finalizado_em,
    }


@garantias_bp.route('/<int:garantia_id>', methods=['DELETE'])
def excluir(garantia_id):
    u = _usuario_atual()
    # Exclusão liberada para quem administra a aba correspondente ao status atual.
    g = Garantia.query.get_or_404(garantia_id)
    if g.status == STATUS_PENDENTE:
        permitido = _pode(u, PAGE_PENDENTES)
    else:
        permitido = _pode(u, PAGE_FINALIZADAS)
    if not permitido:
        return jsonify({'error': 'Acesso restrito.'}), 403

    nome = u.nome if u else 'Sistema'
    # Move para a lixeira (em vez de apagar definitivamente).
    item_excluido = ItemExcluido(
        tipo_item='Garantia',
        item_id_original=str(g.id),
        dados_item=_dados_lixeira(g),
        excluido_por=nome,
        data_exclusao=_agora_iso(),
    )
    db.session.add(item_excluido)
    registrar_log(garantia_id, nome, 'GARANTIA_EXCLUIDA',
                  detalhes={'cliente': g.nome_cliente,
                            'info': f"Garantia de '{g.nome_cliente}' movida para a lixeira."},
                  log_type='garantias')
    db.session.delete(g)
    db.session.commit()
    socketio.emit('garantias_atualizado')
    return jsonify({'status': 'success'})
