# quadro_app/blueprints/listas_dinamicas.py
from flask import Blueprint, request, jsonify
from quadro_app.extensions import db
from quadro_app.models import ListaDinamica, Usuario

listas_bp = Blueprint('listas', __name__, url_prefix='/api/listas')

# --- INÍCIO DA MUDANÇA ---
def garantir_listas_padrao():
    """
    Verifica se as listas padrão existem. Se não, cria elas usando
    os usuários atuais como base para não quebrar o sistema.
    """
    # Lista de listas que o sistema vai gerenciar
    listas_padrao = {
        'vendedores': 'Vendedor',
        'compradores': 'Comprador',
        'separadores': 'Separador',
        'fila_separacao': 'Separador',
        'conferentes_estoque': 'Estoque', # Nova lista para Estoque
        'conferentes_expedicao': 'Expedição'  # Nova lista para Expedição
        # As listas 'marcas' e 'transportadoras' foram removidas
    }

    for nome_lista, role_origem in listas_padrao.items():
        if not ListaDinamica.query.filter_by(nome=nome_lista).first():
            print(f"Inicializando lista dinâmica: {nome_lista}...")
            itens_iniciais = []
            
            if role_origem:
                # O código existente já lida com string ou lista de roles
                if isinstance(role_origem, list):
                     usuarios = Usuario.query.filter(Usuario.role.in_(role_origem)).all()
                else:
                     usuarios = Usuario.query.filter_by(role=role_origem).all()
                
                itens_iniciais = sorted(list(set([u.nome for u in usuarios if u.nome])))
            
            # Casos especiais para remover nomes genéricos se existirem
            if nome_lista == 'separadores':
                itens_iniciais = [i for i in itens_iniciais if i.lower() != 'separacao']
            if nome_lista == 'conferentes_expedicao':
                 itens_iniciais = [i for i in itens_iniciais if i.lower() != 'expedicao']

            nova_lista = ListaDinamica(nome=nome_lista, itens=itens_iniciais)
            db.session.add(nova_lista)
    
    try:
        db.session.commit()
    except Exception as e:
        print(f"Erro ao inicializar listas padrão: {e}")
        db.session.rollback()
# --- FIM DA MUDANÇA ---

@listas_bp.route('', methods=['GET'])
def get_todas_listas():
    # ... (sem alterações)
    listas = ListaDinamica.query.all()
    resultado = {l.nome: l.itens for l in listas}
    return jsonify(resultado)

@listas_bp.route('/<string:nome_lista>', methods=['GET'])
def get_lista(nome_lista):
    # ... (sem alterações)
    lista = ListaDinamica.query.filter_by(nome=nome_lista).first()
    if not lista:
        return jsonify([])
    return jsonify(lista.itens)

@listas_bp.route('/<string:nome_lista>', methods=['PUT'])
def atualizar_lista(nome_lista):
    # ... (sem alterações)
    dados = request.get_json()
    novos_itens = dados.get('itens')
    if not isinstance(novos_itens, list):
        return jsonify({'error': 'Formato inválido. Esperado uma lista de itens.'}), 400
    itens_limpos = []
    seen = set()
    for item in novos_itens:
        item_str = str(item).strip()
        if item_str and item_str.lower() not in seen:
            itens_limpos.append(item_str)
            seen.add(item_str.lower())
    lista = ListaDinamica.query.filter_by(nome=nome_lista).first()
    if not lista:
        lista = ListaDinamica(nome=nome_lista, itens=itens_limpos)
        db.session.add(lista)
    else:
        lista.itens = itens_limpos
    db.session.commit()
    return jsonify({'status': 'success', 'itens': itens_limpos})