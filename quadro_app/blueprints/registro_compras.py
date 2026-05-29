# quadro_app/blueprints/registro_compras.py
from flask import Blueprint, request, jsonify, session
from datetime import datetime, timedelta, time
from ..extensions import db, tz_cuiaba
from ..models import RegistroCompra, MovimentacaoCompra, Usuario
from quadro_app import socketio

compras_registro_bp = Blueprint('compras_registro', __name__, url_prefix='/api/registro-compras')

STATUS_FINALIZADO = 'Pedido Efetuado'


def serialize_registro(r):
    return {
        'id': r.id,
        'fornecedor': r.fornecedor,
        'comprador_nome': r.comprador_nome,
        'observacao': r.observacao,
        'status': r.status,
        'data_criacao': r.data_criacao
    }


# ============================================================
# AUDITORIA — helpers
# ============================================================

def _usuario_pode_auditar():
    """Retorna o Usuario se ele puder ver a auditoria (Admin ou page key), senao None."""
    uid = session.get('user_id')
    if not uid:
        return None
    u = Usuario.query.get(uid)
    if not u:
        return None
    if u.role == 'Admin' or (u.accessible_pages and 'auditoria_compras' in u.accessible_pages):
        return u
    return None


def _registrar_evento(registro_id, status_anterior, status_novo, autor):
    """Cria um evento de movimentacao. status_anterior=None marca a criacao."""
    db.session.add(MovimentacaoCompra(
        registro_id=registro_id,
        status_anterior=status_anterior,
        status_novo=status_novo,
        timestamp=datetime.now(tz_cuiaba).isoformat(),
        autor=autor or 'Sistema',
    ))


def _parse_ts(ts):
    try:
        return datetime.fromisoformat(ts)
    except (TypeError, ValueError):
        return None


# Janelas de expediente da empresa (weekday(): 0=segunda ... 6=domingo)
_JANELA_MANHA = (time(7, 0), time(11, 30))
_JANELA_TARDE = (time(13, 0), time(17, 30))


def _janelas_do_dia(weekday):
    """Janelas de expediente para o dia da semana.
    Seg-Sex: manha e tarde. Sabado: so manha. Domingo: fechado."""
    if weekday <= 4:          # segunda a sexta
        return [_JANELA_MANHA, _JANELA_TARDE]
    if weekday == 5:          # sabado
        return [_JANELA_MANHA]
    return []                 # domingo


def _segundos_uteis(inicio, fim):
    """Conta apenas os segundos dentro do expediente entre inicio e fim,
    descartando noites, horario de almoco e dias sem expediente."""
    if inicio is None or fim is None:
        return None
    if fim <= inicio:
        return 0

    total = 0.0
    dia = inicio.date()
    ultimo_dia = fim.date()
    while dia <= ultimo_dia:
        for ini_t, fim_t in _janelas_do_dia(dia.weekday()):
            jan_ini = datetime.combine(dia, ini_t, tzinfo=inicio.tzinfo)
            jan_fim = datetime.combine(dia, fim_t, tzinfo=inicio.tzinfo)
            ini_ef = max(inicio, jan_ini)
            fim_ef = min(fim, jan_fim)
            if fim_ef > ini_ef:
                total += (fim_ef - ini_ef).total_seconds()
        dia += timedelta(days=1)
    return total


def _format_duracao(segundos):
    """Formata uma duracao em segundos para texto curto: '2d 3h 15m'."""
    if segundos is None:
        return '—'
    segundos = int(segundos)
    if segundos < 0:
        segundos = 0
    dias, resto = divmod(segundos, 86400)
    horas, resto = divmod(resto, 3600)
    minutos, _ = divmod(resto, 60)
    partes = []
    if dias:
        partes.append(f'{dias}d')
    if horas:
        partes.append(f'{horas}h')
    if minutos or not partes:
        partes.append(f'{minutos}m')
    return ' '.join(partes)


def _auditoria_de_registro(eventos):
    """
    A partir da lista de eventos (ordenada por timestamp) de UM registro,
    devolve dados computados ou None se nao houver evento de criacao.
    """
    eventos = sorted(eventos, key=lambda e: e.timestamp)
    criacao = next((e for e in eventos if e.status_anterior is None), None)
    if criacao is None:
        return None  # registro legado / nao auditavel

    inicio = _parse_ts(criacao.timestamp)
    final = next((e for e in eventos if e.status_novo == STATUS_FINALIZADO), None)
    finalizado_em = _parse_ts(final.timestamp) if final else None

    duracao = None
    if inicio and finalizado_em:
        duracao = _segundos_uteis(inicio, finalizado_em)

    return {
        'criado_em': criacao.timestamp,
        'finalizado_em': final.timestamp if final else None,
        'finalizado': final is not None,
        'duracao_segundos': duracao,
        'duracao_texto': _format_duracao(duracao),
        'total_eventos': len(eventos),
        'eventos': eventos,
    }


# ============================================================
# CRUD de registros
# ============================================================

@compras_registro_bp.route('', methods=['POST'])
def criar_registro():
    try:
        dados = request.get_json()
        comprador = dados.get('comprador_nome') or ""
        status = 'Em Cotação' if comprador.strip() else dados.get('status', 'Aguardando')

        novo = RegistroCompra(
            fornecedor=dados.get('fornecedor'),
            comprador_nome=comprador,
            observacao=dados.get('observacao') or "",
            status=status,
            data_criacao=datetime.now(tz_cuiaba).isoformat(),
            editor_nome=dados.get('editor_nome') or "Sistema"
        )
        db.session.add(novo)
        db.session.flush()  # garante novo.id

        # Evento de criacao (status_anterior=None) — torna o registro auditavel.
        _registrar_evento(novo.id, None, status, novo.editor_nome)

        db.session.commit()
        socketio.emit('registro_compras_atualizado')
        return jsonify({'status': 'success', 'id': novo.id}), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@compras_registro_bp.route('', methods=['GET'])
def listar_registros():
    try:
        registros = RegistroCompra.query.order_by(RegistroCompra.data_criacao.desc()).all()
        return jsonify([serialize_registro(r) for r in registros])
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@compras_registro_bp.route('/<int:reg_id>', methods=['PUT'])
def editar_registro(reg_id):
    try:
        dados = request.get_json()
        reg = RegistroCompra.query.get_or_404(reg_id)
        status_anterior = reg.status
        comprador_novo = dados.get('comprador_nome') or ""

        if reg.status == 'Aguardando' and comprador_novo.strip():
            reg.status = 'Em Cotação'
        elif dados.get('status'):
            reg.status = dados.get('status')

        reg.fornecedor = dados.get('fornecedor', reg.fornecedor)
        reg.comprador_nome = comprador_novo
        reg.observacao = dados.get('observacao', reg.observacao)

        # So gera evento se houve mudanca real de status.
        if reg.status != status_anterior:
            autor = dados.get('editor_nome') or reg.editor_nome or 'Sistema'
            _registrar_evento(reg.id, status_anterior, reg.status, autor)

        db.session.commit()
        socketio.emit('registro_compras_atualizado')
        return jsonify({'status': 'success'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@compras_registro_bp.route('/<int:reg_id>', methods=['DELETE'])
def excluir_registro(reg_id):
    try:
        reg = RegistroCompra.query.get_or_404(reg_id)
        # Remove eventos de auditoria manualmente (FK cascade nao e garantido no SQLite).
        MovimentacaoCompra.query.filter_by(registro_id=reg_id).delete(synchronize_session=False)
        db.session.delete(reg)
        db.session.commit()
        socketio.emit('registro_compras_atualizado')
        return jsonify({'status': 'success'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


# ============================================================
# AUDITORIA — endpoints (acesso restrito ao gestor de compras)
# ============================================================

@compras_registro_bp.route('/auditoria', methods=['GET'])
def auditoria_listar():
    """
    Lista os registros auditaveis (criados apos a implementacao do modulo)
    com tempos calculados, e devolve um bloco de medias agregadas.
    Filtros via query string: comprador, fornecedor, dataInicio, dataFim, status.
    'status' aceita: 'finalizados' | 'em_andamento'.
    """
    if not _usuario_pode_auditar():
        return jsonify({'error': 'Acesso restrito ao gestor de compras.'}), 403

    f_comprador = (request.args.get('comprador') or '').strip()
    f_fornecedor = (request.args.get('fornecedor') or '').strip().lower()
    f_data_ini = (request.args.get('dataInicio') or '').strip()
    f_data_fim = (request.args.get('dataFim') or '').strip()
    f_status = (request.args.get('status') or '').strip()

    # Agrupa eventos por registro.
    eventos = MovimentacaoCompra.query.order_by(MovimentacaoCompra.timestamp.asc()).all()
    por_registro = {}
    for ev in eventos:
        por_registro.setdefault(ev.registro_id, []).append(ev)

    if not por_registro:
        return jsonify({'registros': [], 'medias': _medias_vazias()})

    registros = {
        r.id: r for r in RegistroCompra.query.filter(
            RegistroCompra.id.in_(list(por_registro.keys()))
        ).all()
    }

    itens = []
    for reg_id, evs in por_registro.items():
        reg = registros.get(reg_id)
        if reg is None:
            continue  # registro foi excluido
        aud = _auditoria_de_registro(evs)
        if aud is None:
            continue  # sem evento de criacao -> legado

        # --- aplica filtros ---
        if f_comprador and (reg.comprador_nome or '') != f_comprador:
            continue
        if f_fornecedor and f_fornecedor not in (reg.fornecedor or '').lower():
            continue
        if f_data_ini and aud['criado_em'][:10] < f_data_ini:
            continue
        if f_data_fim and aud['criado_em'][:10] > f_data_fim:
            continue
        if f_status == 'finalizados' and not aud['finalizado']:
            continue
        if f_status == 'em_andamento' and aud['finalizado']:
            continue

        itens.append({
            'id': reg.id,
            'fornecedor': reg.fornecedor,
            'comprador_nome': reg.comprador_nome or '',
            'status_atual': reg.status,
            'criado_em': aud['criado_em'],
            'finalizado_em': aud['finalizado_em'],
            'finalizado': aud['finalizado'],
            'duracao_segundos': aud['duracao_segundos'],
            'duracao_texto': aud['duracao_texto'],
            'total_eventos': aud['total_eventos'],
        })

    itens.sort(key=lambda x: x['criado_em'], reverse=True)
    return jsonify({'registros': itens, 'medias': _calcular_medias(itens)})


def _medias_vazias():
    return {
        'total_auditaveis': 0,
        'total_finalizados': 0,
        'total_em_andamento': 0,
        'duracao_media_segundos': None,
        'duracao_media_texto': '—',
        'duracao_min_texto': '—',
        'duracao_max_texto': '—',
        'por_comprador': [],
        'por_fornecedor': [],
    }


def _calcular_medias(itens):
    """Agrega medias de duracao sobre os itens FINALIZADOS."""
    finalizados = [i for i in itens if i['finalizado'] and i['duracao_segundos'] is not None]
    medias = _medias_vazias()
    medias['total_auditaveis'] = len(itens)
    medias['total_finalizados'] = len(finalizados)
    medias['total_em_andamento'] = len(itens) - len(finalizados)
    if not finalizados:
        return medias

    duracoes = [i['duracao_segundos'] for i in finalizados]
    media = sum(duracoes) / len(duracoes)
    medias['duracao_media_segundos'] = media
    medias['duracao_media_texto'] = _format_duracao(media)
    medias['duracao_min_texto'] = _format_duracao(min(duracoes))
    medias['duracao_max_texto'] = _format_duracao(max(duracoes))

    def _agrupar(chave):
        grupos = {}
        for i in finalizados:
            k = i.get(chave) or 'EM ABERTO'
            grupos.setdefault(k, []).append(i['duracao_segundos'])
        saida = []
        for nome, vals in grupos.items():
            m = sum(vals) / len(vals)
            saida.append({
                'nome': nome,
                'qtd': len(vals),
                'media_segundos': m,
                'media_texto': _format_duracao(m),
            })
        saida.sort(key=lambda x: x['media_segundos'], reverse=True)
        return saida

    medias['por_comprador'] = _agrupar('comprador_nome')
    medias['por_fornecedor'] = _agrupar('fornecedor')
    return medias


@compras_registro_bp.route('/auditoria/<int:reg_id>', methods=['GET'])
def auditoria_detalhe(reg_id):
    """Detalhe de auditoria de um pedido: linha do tempo e tempo em cada status."""
    if not _usuario_pode_auditar():
        return jsonify({'error': 'Acesso restrito ao gestor de compras.'}), 403

    reg = RegistroCompra.query.get_or_404(reg_id)
    evs = MovimentacaoCompra.query.filter_by(registro_id=reg_id) \
        .order_by(MovimentacaoCompra.timestamp.asc()).all()
    aud = _auditoria_de_registro(evs)
    if aud is None:
        return jsonify({'error': 'Este registro nao possui dados de auditoria (anterior ao modulo).'}), 404

    eventos = aud['eventos']
    inicio = _parse_ts(aud['criado_em'])
    agora = datetime.now(tz_cuiaba)

    timeline = []
    tempo_por_status = {}
    for idx, ev in enumerate(eventos):
        t_atual = _parse_ts(ev.timestamp)
        # tempo desde o evento anterior
        desde_ant = None
        if idx > 0:
            t_prev = _parse_ts(eventos[idx - 1].timestamp)
            if t_prev and t_atual:
                desde_ant = _segundos_uteis(t_prev, t_atual)
        desde_criacao = None
        if inicio and t_atual:
            desde_criacao = _segundos_uteis(inicio, t_atual)

        timeline.append({
            'status_anterior': ev.status_anterior,
            'status_novo': ev.status_novo,
            'timestamp': ev.timestamp,
            'autor': ev.autor,
            'desde_anterior_segundos': desde_ant,
            'desde_anterior_texto': _format_duracao(desde_ant) if desde_ant is not None else '—',
            'desde_criacao_segundos': desde_criacao,
            'desde_criacao_texto': _format_duracao(desde_criacao) if desde_criacao is not None else '—',
        })

        # tempo que o registro permaneceu no status apos este evento
        prox = _parse_ts(eventos[idx + 1].timestamp) if idx + 1 < len(eventos) else None
        fim_intervalo = prox
        if fim_intervalo is None and ev.status_novo != STATUS_FINALIZADO:
            fim_intervalo = agora  # ainda esta neste status
        if fim_intervalo is not None and t_atual is not None:
            seg = _segundos_uteis(t_atual, fim_intervalo)
            tempo_por_status[ev.status_novo] = tempo_por_status.get(ev.status_novo, 0) + seg

    return jsonify({
        'registro': {
            'id': reg.id,
            'fornecedor': reg.fornecedor,
            'comprador_nome': reg.comprador_nome or '',
            'status': reg.status,
            'observacao': reg.observacao or '',
            'criado_em': aud['criado_em'],
            'finalizado_em': aud['finalizado_em'],
            'finalizado': aud['finalizado'],
            'duracao_segundos': aud['duracao_segundos'],
            'duracao_texto': aud['duracao_texto'],
        },
        'timeline': timeline,
        'tempo_por_status': [
            {'status': s, 'segundos': seg, 'texto': _format_duracao(seg)}
            for s, seg in tempo_por_status.items()
        ],
    })


# ============================================================
# RELATORIO (texto) — inalterado
# ============================================================

@compras_registro_bp.route('/relatorio', methods=['POST'])
def gerar_relatorio_registro():
    filtros = request.get_json() or {}
    try:
        query = RegistroCompra.query
        if filtros.get('fornecedor'):
            query = query.filter(RegistroCompra.fornecedor.ilike(f"%{filtros['fornecedor']}%"))
        if filtros.get('comprador'):
            query = query.filter(RegistroCompra.comprador_nome == filtros['comprador'])
        if filtros.get('status'):
            query = query.filter(RegistroCompra.status == filtros['status'])
        if filtros.get('dataInicio'):
            query = query.filter(RegistroCompra.data_criacao >= filtros['dataInicio'])
        if filtros.get('dataFim'):
            query = query.filter(RegistroCompra.data_criacao <= filtros['dataFim'] + 'T23:59:59')

        registros = query.all()
        if not registros:
            return jsonify({'relatorio': "Nenhum dado encontrado para os filtros aplicados."})

        stats_compradores = {}
        stats_fornecedores = {}
        total_geral = len(registros)

        for r in registros:
            comp = r.comprador_nome or "EM ABERTO"
            stats_compradores[comp] = stats_compradores.get(comp, 0) + 1
            forn = r.fornecedor
            stats_fornecedores[forn] = stats_fornecedores.get(forn, 0) + 1

        now = datetime.now(tz_cuiaba)
        report = []
        report.append("========================================")
        report.append("      RELATÓRIO DE REGISTRO DE COMPRAS")
        report.append("========================================")
        report.append(f"Gerado em: {now.strftime('%d/%m/%Y %H:%M:%S')}")

        # --- NOVO BLOCO DE INFORMAÇÕES DE FILTRO ---
        f_info = []
        if filtros.get('fornecedor'): f_info.append(f"Fornecedor: {filtros['fornecedor']}")
        if filtros.get('comprador'): f_info.append(f"Comprador: {filtros['comprador']}")
        if filtros.get('status'): f_info.append(f"Status: {filtros['status']}")

        data_str = "Todo o período"
        if filtros.get('dataInicio') and filtros.get('dataFim'):
            data_str = f"{filtros['dataInicio']} a {filtros['dataFim']}"
        elif filtros.get('dataInicio'):
            data_str = f"A partir de {filtros['dataInicio']}"
        elif filtros.get('dataFim'):
            data_str = f"Até {filtros['dataFim']}"
        f_info.append(f"Período: {data_str}")

        report.append(f"Filtros Aplicados: {', '.join(f_info)}")
        report.append("----------------------------------------")

        report.append(f"Total de Registros Analisados: {total_geral}")
        report.append("----------------------------------------\n")


        report.append("PRODUTIVIDADE POR COMPRADOR:")
        for comp in sorted(stats_compradores.keys()):
            qtd = stats_compradores[comp]
            perc = (qtd / total_geral) * 100
            report.append(f"  - {comp.ljust(20)}: {str(qtd).rjust(3)} registros")

        report.append("\n----------------------------------------\n")
        report.append("DEMANDA POR FORNECEDOR (Top Demandas):")
        for forn in sorted(stats_fornecedores.keys(), key=lambda x: stats_fornecedores[x], reverse=True):
            qtd = stats_fornecedores[forn]
            report.append(f"  - {forn.ljust(25)}: {qtd} pedido(s)")

        report.append("\n======================================== ")
        report.append("            FIM DO RELATÓRIO")
        report.append("======================================== ")

        return jsonify({'relatorio': '\n'.join(report)})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
