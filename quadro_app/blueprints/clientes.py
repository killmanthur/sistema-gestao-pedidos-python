# quadro_app/blueprints/clientes.py
from flask import Blueprint, request, jsonify
from sqlalchemy import func
from ..extensions import db
from quadro_app.models import Separacao, SeparacaoCancelada, ListaDinamica
from quadro_app.utils import registrar_log
from quadro_app import socketio

clientes_bp = Blueprint('clientes', __name__, url_prefix='/api/clientes')

LISTA_OCULTOS = 'clientes_ocultos'


def _get_ocultos_lista():
    lista = ListaDinamica.query.filter_by(nome=LISTA_OCULTOS).first()
    if not lista:
        lista = ListaDinamica(nome=LISTA_OCULTOS, itens=[])
        db.session.add(lista)
        db.session.commit()
    return lista


def get_clientes_ocultos():
    """Conjunto de nomes ocultos (usado também pelo autocomplete)."""
    lista = ListaDinamica.query.filter_by(nome=LISTA_OCULTOS).first()
    return set(lista.itens or []) if lista else set()


@clientes_bp.route('/paginadas', methods=['POST'])
def listar_paginadas():
    dados = request.get_json() or {}
    page = dados.get('page', 0)
    limit = dados.get('limit', 30)
    search = (dados.get('search') or '').strip()

    ocultos = get_clientes_ocultos()
    apenas_ocultos = bool(dados.get('apenas_ocultos'))

    query = db.session.query(
        Separacao.nome_cliente,
        func.count(Separacao.id)
    ).filter(
        Separacao.nome_cliente.isnot(None),
        Separacao.nome_cliente != ''
    )
    if search:
        query = query.filter(Separacao.nome_cliente.ilike(f'%{search}%'))
    if apenas_ocultos:
        if not ocultos:
            return jsonify({'clientes': [], 'temMais': False})
        query = query.filter(Separacao.nome_cliente.in_(list(ocultos)))
    query = query.group_by(Separacao.nome_cliente)\
                 .order_by(func.lower(Separacao.nome_cliente))

    # Busca um a mais para saber se há próxima página. Ocultos continuam na lista,
    # marcados com 'oculto', para dar feedback visual em vez de sumir.
    offset = page * limit
    linhas = query.offset(offset).limit(limit + 1).all()
    tem_mais = len(linhas) > limit
    visiveis = [
        {'nome': n, 'usos': c, 'oculto': n in ocultos}
        for (n, c) in linhas[:limit]
    ]
    return jsonify({'clientes': visiveis, 'temMais': tem_mais})


@clientes_bp.route('/ocultos', methods=['GET'])
def listar_ocultos():
    return jsonify(sorted(get_clientes_ocultos(), key=lambda n: n.lower()))


@clientes_bp.route('/renomear', methods=['PUT'])
def renomear():
    dados = request.get_json() or {}
    # 'de' é a chave de busca — NÃO pode ser alterada (nomes podem ter espaços
    # nas pontas no banco). 'para' é o novo valor, esse sim limpamos.
    de = dados.get('de') or ''
    para = (dados.get('para') or '').strip()
    editor_nome = dados.get('editor_nome', 'Sistema')
    if not de.strip() or not para:
        return jsonify({'error': 'Informe o nome atual e o novo nome.'}), 400
    if de == para:
        return jsonify({'status': 'success'})

    n1 = Separacao.query.filter_by(nome_cliente=de).update(
        {Separacao.nome_cliente: para}, synchronize_session=False)
    n2 = SeparacaoCancelada.query.filter_by(nome_cliente=de).update(
        {SeparacaoCancelada.nome_cliente: para}, synchronize_session=False)
    db.session.commit()

    registrar_log('cliente', editor_nome, 'CLIENTE_RENOMEADO',
                  detalhes={'de': de, 'para': para, 'registros': n1 + n2},
                  log_type='clientes')
    socketio.emit('clientes_atualizado', {})
    return jsonify({'status': 'success', 'registros': n1 + n2})


@clientes_bp.route('/mesclar', methods=['PUT'])
def mesclar():
    """Unifica vários nomes (variantes do mesmo cliente) em um só. Todas as
    separações dos nomes em 'nomes' passam a usar 'para'."""
    dados = request.get_json() or {}
    nomes = dados.get('nomes') or []
    para = (dados.get('para') or '').strip()
    editor_nome = dados.get('editor_nome', 'Sistema')
    if not isinstance(nomes, list) or not nomes or not para:
        return jsonify({'error': 'Selecione os nomes e informe o nome correto.'}), 400

    total = 0
    for de in nomes:
        if de == para:
            continue
        total += Separacao.query.filter_by(nome_cliente=de).update(
            {Separacao.nome_cliente: para}, synchronize_session=False)
        total += SeparacaoCancelada.query.filter_by(nome_cliente=de).update(
            {SeparacaoCancelada.nome_cliente: para}, synchronize_session=False)

    # Os nomes mesclados deixam de existir: remove-os da lista de ocultos.
    lista = ListaDinamica.query.filter_by(nome=LISTA_OCULTOS).first()
    if lista and lista.itens:
        mesclados = {n for n in nomes if n != para}
        novos = [n for n in lista.itens if n not in mesclados]
        if len(novos) != len(lista.itens):
            lista.itens = novos

    db.session.commit()
    registrar_log('cliente', editor_nome, 'CLIENTES_MESCLADOS',
                  detalhes={'nomes': nomes, 'para': para, 'registros': total},
                  log_type='clientes')
    socketio.emit('clientes_atualizado', {})
    return jsonify({'status': 'success', 'registros': total})


@clientes_bp.route('/ocultar', methods=['POST'])
def ocultar():
    dados = request.get_json() or {}
    # Guarda o nome EXATAMENTE como está no banco (pode ter espaços nas pontas).
    nome = dados.get('nome') or ''
    editor_nome = dados.get('editor_nome', 'Sistema')
    if not nome.strip():
        return jsonify({'error': 'Nome inválido.'}), 400
    lista = _get_ocultos_lista()
    itens = list(lista.itens or [])
    if nome not in itens:
        itens.append(nome)
        lista.itens = itens
        db.session.commit()
    registrar_log('cliente', editor_nome, 'CLIENTE_OCULTADO',
                  detalhes={'nome': nome}, log_type='clientes')
    socketio.emit('clientes_atualizado', {})
    return jsonify({'status': 'success'})


@clientes_bp.route('/restaurar', methods=['POST'])
def restaurar():
    dados = request.get_json() or {}
    nome = dados.get('nome') or ''
    editor_nome = dados.get('editor_nome', 'Sistema')
    lista = _get_ocultos_lista()
    itens = [n for n in (lista.itens or []) if n != nome]
    lista.itens = itens
    db.session.commit()
    registrar_log('cliente', editor_nome, 'CLIENTE_RESTAURADO',
                  detalhes={'nome': nome}, log_type='clientes')
    socketio.emit('clientes_atualizado', {})
    return jsonify({'status': 'success'})
