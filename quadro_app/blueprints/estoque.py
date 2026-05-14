# quadro_app/blueprints/estoque.py
import os
import uuid
from datetime import datetime

from flask import Blueprint, request, jsonify, current_app, session
from sqlalchemy import func
from ..extensions import db, tz_cuiaba
from ..models import AjusteEstoque, CampanhaAjuste, Usuario
from ..utils import registrar_log
from quadro_app import socketio

estoque_bp = Blueprint('estoque', __name__, url_prefix='/api/estoque')

ALLOWED_EXT = {'jpg', 'jpeg', 'png', 'webp'}
UPLOAD_SUBDIR = os.path.join('uploads', 'pecas')


def serialize_ajuste(a):
    return {
        'id': a.id,
        'campanha_id': a.campanha_id,
        'codigo': a.codigo,
        'marca': a.marca,
        'descricao': a.descricao,
        'quantidade_sistema': a.quantidade_sistema,
        'quantidade_real': a.quantidade_real,
        'status': a.status,
        # Campos de auditoria - sempre retornados para exibir quem fez a contagem
        'criado_por': a.criado_por,
        'criado_por_id': a.criado_por_id,
        'criado_por_role': a.criado_por_role,
        'data_criacao': a.data_criacao,
        'aprovado_por': a.aprovado_por,
        'aprovado_por_id': a.aprovado_por_id,
        'data_aprovacao': a.data_aprovacao,
        'observacao_gerente': a.observacao_gerente,
        'foto_url': f"/static/{a.foto_path}" if a.foto_path else None,
        'foto_cadastrada_no_erp': a.foto_cadastrada_no_erp,
        'foto_cadastrada_em': a.foto_cadastrada_em,
        'foto_cadastrada_por': a.foto_cadastrada_por,
    }


def serialize_campanha(c, incluir_stats=True, incluir_ajustadores=True):
    d = {
        'id': c.id,
        'nome': c.nome,
        'status': c.status,
        'observacao': c.observacao,
        'criado_por': c.criado_por,
        'criado_por_id': c.criado_por_id,
        'data_inicio': c.data_inicio,
        'data_fim': c.data_fim,
        'finalizado_por': c.finalizado_por,
        'finalizado_por_id': c.finalizado_por_id,
    }
    if incluir_ajustadores:
        d['ajustadores'] = [
            {'id': u.id, 'nome': u.nome or u.email, 'email': u.email, 'role': u.role}
            for u in c.ajustadores
        ]
    if incluir_stats:
        rows = (
            db.session.query(AjusteEstoque.status, func.count(AjusteEstoque.id))
            .filter(AjusteEstoque.campanha_id == c.id)
            .group_by(AjusteEstoque.status)
            .all()
        )
        stats = {'Pendente': 0, 'Ajustado': 0, 'Cancelado': 0}
        for st, n in rows:
            stats[st] = n
        stats['total'] = sum(stats.values())
        d['stats'] = stats
    return d


def _save_upload(file_storage):
    """Valida e salva foto. Retorna caminho relativo a static/ ou None."""
    if not file_storage or not file_storage.filename:
        return None
    ext = file_storage.filename.rsplit('.', 1)[-1].lower()
    if ext not in ALLOWED_EXT:
        return None
    unique = f"{uuid.uuid4().hex}.{ext}"
    abs_dir = os.path.join(current_app.static_folder, UPLOAD_SUBDIR)
    os.makedirs(abs_dir, exist_ok=True)
    abs_path = os.path.join(abs_dir, unique)
    file_storage.save(abs_path)
    return f"uploads/pecas/{unique}"


def _get_usuario_sessao():
    user_id = session.get('user_id')
    if not user_id:
        return None
    return Usuario.query.get(user_id)


def _usuario_pode_aprovar(usuario):
    """Espelha o decorator page_access_required('aprovar_ajuste_estoque')."""
    if not usuario:
        return False
    if usuario.role == 'Admin':
        return True
    return bool(usuario.accessible_pages and 'aprovar_ajuste_estoque' in usuario.accessible_pages)


# ============================================================
# CAMPANHAS
# ============================================================

@estoque_bp.route('/campanhas', methods=['GET'])
def listar_campanhas():
    """Lista campanhas. Filtro opcional ?status=Ativa|Finalizada."""
    query = CampanhaAjuste.query
    status = request.args.get('status')
    if status:
        query = query.filter_by(status=status)
    query = query.order_by(
        # 'Ativa' < 'Finalizada' alfabeticamente => asc deixa Ativa primeiro
        CampanhaAjuste.status.asc(),
        CampanhaAjuste.data_inicio.desc(),
    )
    return jsonify([serialize_campanha(c) for c in query.all()])


@estoque_bp.route('/campanhas/minhas-ativas', methods=['GET'])
def listar_minhas_campanhas_ativas():
    """Campanhas Ativas onde o usuario logado e ajustador."""
    usuario = _get_usuario_sessao()
    if not usuario:
        return jsonify({'error': 'Nao autenticado.'}), 401
    ativas = (
        CampanhaAjuste.query
        .filter(CampanhaAjuste.status == 'Ativa')
        .filter(CampanhaAjuste.ajustadores.any(Usuario.id == usuario.id))
        .order_by(CampanhaAjuste.data_inicio.desc())
        .all()
    )
    return jsonify([serialize_campanha(c, incluir_stats=False) for c in ativas])


@estoque_bp.route('/campanhas/<int:campanha_id>', methods=['GET'])
def obter_campanha(campanha_id):
    c = CampanhaAjuste.query.get_or_404(campanha_id)
    return jsonify(serialize_campanha(c))


@estoque_bp.route('/campanhas', methods=['POST'])
def criar_campanha():
    usuario = _get_usuario_sessao()
    if not _usuario_pode_aprovar(usuario):
        return jsonify({'error': 'Sem permissao para criar campanhas.'}), 403

    dados = request.get_json() or {}
    nome = (dados.get('nome') or '').strip()
    if not nome:
        return jsonify({'error': 'Nome da campanha e obrigatorio.'}), 400

    ajustadores_ids = dados.get('ajustadores_ids') or []
    if not isinstance(ajustadores_ids, list) or not ajustadores_ids:
        return jsonify({'error': 'Selecione ao menos um ajustador.'}), 400

    ajustadores = Usuario.query.filter(Usuario.id.in_(ajustadores_ids)).all()
    if len(ajustadores) != len(set(ajustadores_ids)):
        return jsonify({'error': 'Algum ajustador selecionado nao existe.'}), 400

    agora = datetime.now(tz_cuiaba).isoformat()
    campanha = CampanhaAjuste(
        nome=nome,
        status='Ativa',
        observacao=(dados.get('observacao') or None),
        criado_por=usuario.nome or usuario.email,
        criado_por_id=usuario.id,
        data_inicio=agora,
    )
    campanha.ajustadores = ajustadores
    db.session.add(campanha)
    db.session.commit()

    payload = serialize_campanha(campanha)
    socketio.emit('campanha_ajuste_criada', payload)
    return jsonify({'status': 'success', 'campanha': payload}), 201


@estoque_bp.route('/campanhas/<int:campanha_id>/ajustadores', methods=['PUT'])
def atualizar_ajustadores_campanha(campanha_id):
    usuario = _get_usuario_sessao()
    if not _usuario_pode_aprovar(usuario):
        return jsonify({'error': 'Sem permissao.'}), 403
    campanha = CampanhaAjuste.query.get_or_404(campanha_id)
    if campanha.status != 'Ativa':
        return jsonify({'error': 'Campanha finalizada nao pode ter ajustadores alterados.'}), 409

    dados = request.get_json() or {}
    ids = dados.get('ajustadores_ids') or []
    if not isinstance(ids, list) or not ids:
        return jsonify({'error': 'Selecione ao menos um ajustador.'}), 400
    ajustadores = Usuario.query.filter(Usuario.id.in_(ids)).all()
    if len(ajustadores) != len(set(ids)):
        return jsonify({'error': 'Algum ajustador nao existe.'}), 400

    campanha.ajustadores = ajustadores
    db.session.commit()
    payload = serialize_campanha(campanha)
    socketio.emit('campanha_ajuste_atualizada', payload)
    return jsonify({'status': 'success', 'campanha': payload})


@estoque_bp.route('/campanhas/<int:campanha_id>/finalizar', methods=['POST'])
def finalizar_campanha(campanha_id):
    usuario = _get_usuario_sessao()
    if not _usuario_pode_aprovar(usuario):
        return jsonify({'error': 'Sem permissao.'}), 403
    campanha = CampanhaAjuste.query.get_or_404(campanha_id)
    if campanha.status == 'Finalizada':
        return jsonify({'error': 'Campanha ja finalizada.'}), 409

    pendentes = AjusteEstoque.query.filter_by(campanha_id=campanha.id, status='Pendente').count()
    forcar = (request.get_json() or {}).get('forcar', False)
    if pendentes and not forcar:
        return jsonify({
            'error': f'Ha {pendentes} ajustes pendentes. Processe-os ou envie forcar=true.',
            'pendentes': pendentes,
        }), 409

    campanha.status = 'Finalizada'
    campanha.data_fim = datetime.now(tz_cuiaba).isoformat()
    campanha.finalizado_por = usuario.nome or usuario.email
    campanha.finalizado_por_id = usuario.id
    db.session.commit()

    payload = serialize_campanha(campanha)
    socketio.emit('campanha_ajuste_atualizada', payload)
    return jsonify({'status': 'success', 'campanha': payload})


@estoque_bp.route('/campanhas/<int:campanha_id>/reabrir', methods=['POST'])
def reabrir_campanha(campanha_id):
    usuario = _get_usuario_sessao()
    if not _usuario_pode_aprovar(usuario):
        return jsonify({'error': 'Sem permissao.'}), 403
    campanha = CampanhaAjuste.query.get_or_404(campanha_id)
    if campanha.status == 'Ativa':
        return jsonify({'error': 'Campanha ja esta ativa.'}), 409
    if campanha.nome == 'Legado':
        return jsonify({'error': 'Campanha Legado nao pode ser reaberta.'}), 409

    campanha.status = 'Ativa'
    campanha.data_fim = None
    campanha.finalizado_por = None
    campanha.finalizado_por_id = None
    db.session.commit()
    payload = serialize_campanha(campanha)
    socketio.emit('campanha_ajuste_atualizada', payload)
    return jsonify({'status': 'success', 'campanha': payload})


@estoque_bp.route('/campanhas/<int:campanha_id>', methods=['DELETE'])
def excluir_campanha(campanha_id):
    """
    Exclui uma campanha permanentemente.
    Regras de proteção:
      - Requer permissão de gestor/admin.
      - A campanha 'Legado' nunca pode ser excluída.
      - Não é permitido excluir se houver requisições (ajustes) vinculadas,
        independentemente do status delas (preservação de histórico).
    """
    usuario = _get_usuario_sessao()
    if not _usuario_pode_aprovar(usuario):
        return jsonify({'error': 'Sem permissao para excluir campanhas.'}), 403

    campanha = CampanhaAjuste.query.get_or_404(campanha_id)

    if campanha.nome == 'Legado':
        return jsonify({'error': 'A campanha "Legado" e de sistema e nao pode ser excluida.'}), 409

    total_ajustes = AjusteEstoque.query.filter_by(campanha_id=campanha_id).count()
    if total_ajustes > 0:
        return jsonify({
            'error': (
                f'Esta campanha possui {total_ajustes} '
                f'requisicao{"" if total_ajustes == 1 else "oes"} vinculada{"" if total_ajustes == 1 else "s"} '
                f'e nao pode ser excluida. '
                f'Cancele ou processe todas as requisicoes antes de excluir a campanha.'
            ),
            'total_ajustes': total_ajustes,
        }), 409

    nome_campanha = campanha.nome
    db.session.delete(campanha)
    db.session.commit()

    registrar_log(
        campanha_id,
        usuario.nome or usuario.email,
        'CAMPANHA_EXCLUIDA',
        detalhes={'nome': nome_campanha},
        log_type='estoque',
    )
    socketio.emit('campanha_ajuste_excluida', {'id': campanha_id, 'nome': nome_campanha})
    return jsonify({'status': 'success', 'message': f'Campanha "{nome_campanha}" excluida com sucesso.'})


# ============================================================
# AJUSTES
# ============================================================

@estoque_bp.route('/ajustes', methods=['POST'])
def criar_ajuste():
    codigo = (request.form.get('codigo') or '').strip()
    marca = (request.form.get('marca') or '').strip()
    if not codigo or not marca:
        return jsonify({'error': 'Codigo e marca sao obrigatorios.'}), 400

    campanha_id_raw = request.form.get('campanha_id')
    try:
        campanha_id = int(campanha_id_raw)
    except (TypeError, ValueError):
        return jsonify({'error': 'Campanha invalida. Selecione uma campanha ativa.'}), 400

    qtd_real_raw = request.form.get('quantidade_real')
    try:
        qtd_real = int(qtd_real_raw)
    except (TypeError, ValueError):
        return jsonify({'error': 'Quantidade real invalida.'}), 400

    qtd_sistema = request.form.get('quantidade_sistema')
    try:
        qtd_sistema = int(qtd_sistema) if qtd_sistema not in (None, '') else None
    except ValueError:
        qtd_sistema = None

    usuario = _get_usuario_sessao()
    if not usuario:
        return jsonify({'error': 'Nao autenticado.'}), 401

    campanha = CampanhaAjuste.query.get(campanha_id)
    if not campanha:
        return jsonify({'error': 'Campanha nao encontrada.'}), 404
    if campanha.status != 'Ativa':
        return jsonify({'error': 'Campanha nao esta ativa.'}), 409
    if not any(u.id == usuario.id for u in campanha.ajustadores):
        return jsonify({'error': 'Voce nao esta vinculado a esta campanha.'}), 403

    foto_path = _save_upload(request.files.get('foto'))

    ajuste = AjusteEstoque(
        campanha_id=campanha.id,
        codigo=codigo,
        marca=marca,
        descricao=(request.form.get('descricao') or None),
        quantidade_sistema=qtd_sistema,
        quantidade_real=qtd_real,
        status='Pendente',
        criado_por=usuario.nome or usuario.email,
        criado_por_id=usuario.id,
        criado_por_role=usuario.role,
        data_criacao=datetime.now(tz_cuiaba).isoformat(),
        foto_path=foto_path,
    )
    db.session.add(ajuste)
    db.session.commit()

    registrar_log(
        ajuste.id,
        ajuste.criado_por,
        'CRIACAO',
        detalhes={
            'campanha_id': campanha.id,
            'campanha_nome': campanha.nome,
            'codigo': codigo,
            'marca': marca,
            'qtd_sistema': qtd_sistema,
            'qtd_real': qtd_real,
            'com_foto': bool(foto_path),
        },
        log_type='estoque',
    )
    socketio.emit('novo_ajuste_estoque', serialize_ajuste(ajuste))
    return jsonify({'status': 'success', 'ajuste': serialize_ajuste(ajuste)}), 201


@estoque_bp.route('/ajustes', methods=['GET'])
def listar_ajustes():
    query = AjusteEstoque.query

    campanha_id = request.args.get('campanha_id')
    if campanha_id:
        try:
            query = query.filter_by(campanha_id=int(campanha_id))
        except ValueError:
            return jsonify({'error': 'campanha_id invalido.'}), 400

    status = request.args.get('status')
    if status:
        query = query.filter_by(status=status)

    if request.args.get('com_foto') == '1':
        query = query.filter(AjusteEstoque.foto_path.isnot(None))

    cad_erp = request.args.get('cadastrada_no_erp')
    if cad_erp in ('0', '1'):
        query = query.filter_by(foto_cadastrada_no_erp=(cad_erp == '1'))

    if request.args.get('somente_minhas') == '1':
        usuario = _get_usuario_sessao()
        if usuario:
            query = query.filter_by(criado_por_id=usuario.id)

    query = query.order_by(AjusteEstoque.data_criacao.desc())

    try:
        limit = int(request.args.get('limit', 200))
    except ValueError:
        limit = 200
    limit = max(1, min(limit, 500))

    return jsonify([serialize_ajuste(a) for a in query.limit(limit).all()])


@estoque_bp.route('/ajustes/<int:ajuste_id>', methods=['GET'])
def obter_ajuste(ajuste_id):
    ajuste = AjusteEstoque.query.get_or_404(ajuste_id)
    return jsonify(serialize_ajuste(ajuste))


@estoque_bp.route('/ajustes/<int:ajuste_id>/aprovar', methods=['POST'])
def aprovar_ajuste(ajuste_id):
    ajuste = AjusteEstoque.query.get_or_404(ajuste_id)
    if ajuste.status != 'Pendente':
        return jsonify({'error': f'Requisicao ja esta {ajuste.status}.'}), 409

    dados = request.get_json() or {}
    usuario = _get_usuario_sessao()
    if not usuario:
        return jsonify({'error': 'Nao autenticado.'}), 401

    ajuste.status = 'Ajustado'
    ajuste.aprovado_por = usuario.nome or usuario.email
    ajuste.aprovado_por_id = usuario.id
    ajuste.data_aprovacao = datetime.now(tz_cuiaba).isoformat()
    ajuste.observacao_gerente = (dados.get('observacao') or None)
    db.session.commit()

    registrar_log(
        ajuste.id,
        ajuste.aprovado_por,
        'AJUSTE_APROVADO',
        detalhes={'observacao': ajuste.observacao_gerente},
        log_type='estoque',
    )
    socketio.emit('ajuste_estoque_atualizado', serialize_ajuste(ajuste))
    return jsonify({'status': 'success', 'ajuste': serialize_ajuste(ajuste)})


@estoque_bp.route('/ajustes/<int:ajuste_id>/cancelar', methods=['POST'])
def cancelar_ajuste(ajuste_id):
    ajuste = AjusteEstoque.query.get_or_404(ajuste_id)
    if ajuste.status != 'Pendente':
        return jsonify({'error': f'Requisicao ja esta {ajuste.status}.'}), 409

    dados = request.get_json() or {}
    usuario = _get_usuario_sessao()
    if not usuario:
        return jsonify({'error': 'Nao autenticado.'}), 401

    ajuste.status = 'Cancelado'
    ajuste.aprovado_por = usuario.nome or usuario.email
    ajuste.aprovado_por_id = usuario.id
    ajuste.data_aprovacao = datetime.now(tz_cuiaba).isoformat()
    ajuste.observacao_gerente = (dados.get('observacao') or None)
    db.session.commit()

    registrar_log(
        ajuste.id,
        ajuste.aprovado_por,
        'AJUSTE_CANCELADO',
        detalhes={'observacao': ajuste.observacao_gerente},
        log_type='estoque',
    )
    socketio.emit('ajuste_estoque_atualizado', serialize_ajuste(ajuste))
    return jsonify({'status': 'success', 'ajuste': serialize_ajuste(ajuste)})


@estoque_bp.route('/ajustes/<int:ajuste_id>/foto-cadastrada', methods=['POST'])
def marcar_foto_cadastrada(ajuste_id):
    ajuste = AjusteEstoque.query.get_or_404(ajuste_id)
    if not ajuste.foto_path:
        return jsonify({'error': 'Este ajuste nao possui foto.'}), 400

    usuario = _get_usuario_sessao()
    if not usuario:
        return jsonify({'error': 'Nao autenticado.'}), 401

    ajuste.foto_cadastrada_no_erp = True
    ajuste.foto_cadastrada_em = datetime.now(tz_cuiaba).isoformat()
    ajuste.foto_cadastrada_por = usuario.nome or usuario.email
    db.session.commit()

    registrar_log(
        ajuste.id,
        ajuste.foto_cadastrada_por,
        'FOTO_CADASTRADA_ERP',
        log_type='estoque',
    )
    socketio.emit('ajuste_estoque_atualizado', serialize_ajuste(ajuste))
    return jsonify({'status': 'success', 'ajuste': serialize_ajuste(ajuste)})


@estoque_bp.route('/ajustes/<int:ajuste_id>/foto-cadastrada', methods=['DELETE'])
def desmarcar_foto_cadastrada(ajuste_id):
    """Reverte a marcacao (caso o usuario tenha clicado errado)."""
    ajuste = AjusteEstoque.query.get_or_404(ajuste_id)
    ajuste.foto_cadastrada_no_erp = False
    ajuste.foto_cadastrada_em = None
    ajuste.foto_cadastrada_por = None
    db.session.commit()
    socketio.emit('ajuste_estoque_atualizado', serialize_ajuste(ajuste))
    return jsonify({'status': 'success', 'ajuste': serialize_ajuste(ajuste)})
