# quadro_app/blueprints/usuarios.py
from flask import Blueprint, request, jsonify
from ..extensions import db
from quadro_app.models import Usuario, ListaDinamica 
import uuid
from werkzeug.security import generate_password_hash, check_password_hash

usuarios_bp = Blueprint('usuarios', __name__, url_prefix='/api/usuarios')

def serialize_usuario(u):
    """Converte um objeto Usuario SQLAlchemy para um dicionário."""
    return {
        "uid": u.id,
        "email": u.email,
        "nome": u.nome,
        "role": u.role,
        "accessible_pages": u.accessible_pages,
        "permissions": u.permissions
    }

@usuarios_bp.route('/login', methods=['POST'])
def login():
    """Rota de login local. Verifica email e senha."""
    dados = request.get_json()
    if not dados or not dados.get('email') or not dados.get('password'):
        return jsonify({'error': 'Email e senha são obrigatórios.'}), 400

    domain = "@tratormax.net.br"
    user_input = dados.get('email').strip()
    password = dados.get('password')
    final_email = user_input if '@' in user_input else f"{user_input}{domain}"

    usuario = Usuario.query.filter_by(email=final_email).first()

    if usuario and check_password_hash(usuario.password_hash, password):
        return jsonify(serialize_usuario(usuario))
    
    return jsonify({'error': 'Usuário ou senha inválidos'}), 401

@usuarios_bp.route('', methods=['GET'])
def get_all_users():
    usuarios = Usuario.query.all()
    return jsonify([serialize_usuario(u) for u in usuarios])

@usuarios_bp.route('', methods=['POST'])
def create_user():
    dados = request.get_json()
    email, password, nome, role = dados.get('email'), dados.get('password'), dados.get('nome'), dados.get('role')

    if not all([email, password, nome, role]):
        return jsonify({"error": "Todos os campos são obrigatórios."}), 400
        
    if Usuario.query.filter_by(email=email).first():
        return jsonify({'error': 'Este email já está em uso.'}), 409

    novo_usuario = Usuario(
        id=str(uuid.uuid4()),
        email=email,
        nome=nome,
        role=role,
        password_hash=generate_password_hash(password),
        accessible_pages=dados.get('accessible_pages', []),
        permissions=dados.get('permissions', {})
    )
    db.session.add(novo_usuario)
    db.session.commit()
    return jsonify({"status": "success", "uid": novo_usuario.id}), 201

@usuarios_bp.route('/<string:uid>', methods=['PUT'])
def update_user(uid):
    dados = request.get_json()
    usuario = Usuario.query.get_or_404(uid)
    
    usuario.email = dados.get('email', usuario.email)
    usuario.nome = dados.get('nome', usuario.nome)
    usuario.role = dados.get('role', usuario.role)
    usuario.accessible_pages = dados.get('accessible_pages', usuario.accessible_pages)
    usuario.permissions = dados.get('permissions', usuario.permissions)
    
    db.session.commit()
    return jsonify({"status": "success"})

@usuarios_bp.route('/<string:uid>', methods=['DELETE'])
def delete_user(uid):
    usuario = Usuario.query.get_or_404(uid)
    db.session.delete(usuario)
    db.session.commit()
    return jsonify({"status": "success"})

@usuarios_bp.route('/<string:uid>/set-password', methods=['POST'])
def set_user_password(uid):
    dados = request.get_json()
    new_password = dados.get('password')
    if not new_password or len(new_password) < 6:
        return jsonify({"error": "A senha é obrigatória e deve ter no mínimo 6 caracteres."}), 400
    
    usuario = Usuario.query.get_or_404(uid)
    usuario.password_hash = generate_password_hash(new_password)
    db.session.commit()
    return jsonify({"status": "success", "message": "Senha atualizada com sucesso."})


def _get_lista_dinamica_ou_fallback(nome_lista, role_fallback):
    """
    Tenta buscar da nova lista dinâmica. Se falhar (ex: banco ainda não migrado),
    faz fallback para a busca antiga por role na tabela de usuários.
    """
    lista = ListaDinamica.query.filter_by(nome=nome_lista).first()
    if lista:
        return sorted(lista.itens)
    
    # Fallback (segurança)
    users = Usuario.query.filter_by(role=role_fallback).all()
    return sorted([u.nome for u in users if u.nome])

@usuarios_bp.route('/comprador-nomes', methods=['GET'])
def get_comprador_nomes():
    return jsonify(_get_lista_dinamica_ou_fallback('compradores', 'Comprador'))

@usuarios_bp.route('/vendedor-nomes', methods=['GET'])
def get_vendedor_nomes():
    return jsonify(_get_lista_dinamica_ou_fallback('vendedores', 'Vendedor'))

@usuarios_bp.route('/destinos-rua', methods=['GET'])
def get_destinos_rua():
    vendedores = _get_lista_dinamica_ou_fallback('vendedores', 'Vendedor')
    if "Estoque" not in vendedores:
        vendedores.append("Estoque")
    return jsonify(sorted(vendedores))

@usuarios_bp.route('/separador-nomes', methods=['GET'])
def get_separador_nomes():
    return jsonify(_get_lista_dinamica_ou_fallback('separadores', 'Separador'))

@usuarios_bp.route('/expedicao-nomes', methods=['GET'])
def get_expedicao_nomes():
    # Agora busca da lista específica de conferentes da expedição
    return jsonify(_get_lista_dinamica_ou_fallback('conferentes_expedicao', 'Expedição'))

@usuarios_bp.route('/estoquista-nomes', methods=['GET'])
def get_estoquista_nomes():
    # Agora busca da lista específica de conferentes do estoque
     return jsonify(_get_lista_dinamica_ou_fallback('conferentes_estoque', 'Estoque'))