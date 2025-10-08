# quadro_app/blueprints/usuarios.py
from flask import Blueprint, request, jsonify
from functools import wraps
from firebase_admin import auth
from quadro_app import db 

usuarios_bp = Blueprint('usuarios', __name__, url_prefix='/api/usuarios')

def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        id_token = request.headers.get('Authorization', '').split('Bearer ')[-1]
        if not id_token:
            return jsonify({"error": "Token de autorização ausente."}), 401
        try:
            decoded_token = auth.verify_id_token(id_token)
            caller_uid = decoded_token['uid']
            user_data = db.reference(f'usuarios/{caller_uid}').get()
            if not user_data or user_data.get('role') != 'Admin':
                return jsonify({"error": "Acesso negado. Requer privilégios de administrador."}), 403
        except Exception as e:
            return jsonify({"error": f"Erro de autenticação: {str(e)}"}), 401
        return f(*args, **kwargs)
    return decorated_function

@usuarios_bp.route('', methods=['GET'])
@admin_required
def get_all_users():
    try:
        all_users_auth = auth.list_users().iterate_all()
        all_users_db = db.reference('usuarios').get() or {}
        
        user_list = []
        for user_auth in all_users_auth:
            user_db_data = all_users_db.get(user_auth.uid, {})
            user_list.append({
                "uid": user_auth.uid,
                "email": user_auth.email,
                "nome": user_db_data.get('nome', 'N/A'),
                "role": user_db_data.get('role', 'Sem Role'),
                "accessible_pages": user_db_data.get('accessible_pages', []),
                # LÓGICA ALTERADA: Pega as permissões de dentro do próprio usuário
                "permissions": user_db_data.get('permissions', {}) 
            })
        return jsonify(user_list)
    except Exception as e:
        return jsonify({"error": f"Não foi possível buscar usuários: {str(e)}"}), 500

@usuarios_bp.route('', methods=['POST'])
@admin_required
def create_user():
    data = request.get_json()
    email, password, nome, role = data.get('email'), data.get('password'), data.get('nome'), data.get('role')
    if not all([email, password, nome, role]):
        return jsonify({"error": "Todos os campos são obrigatórios."}), 400
    try:
        new_user = auth.create_user(email=email, password=password)
        # LÓGICA ALTERADA: Salva tudo no nó do usuário, incluindo as permissões
        db.reference(f'usuarios/{new_user.uid}').set({
            "nome": nome,
            "role": role,
            "email": email,
            "accessible_pages": data.get('accessible_pages', []),
            "permissions": data.get('permissions', {}) # Salva permissões individuais
        })
        return jsonify({"status": "success", "uid": new_user.uid}), 201
    except Exception as e:
        if 'new_user' in locals(): auth.delete_user(new_user.uid)
        return jsonify({"error": f"Erro ao criar usuário: {str(e)}"}), 500

@usuarios_bp.route('/<string:uid>', methods=['PUT'])
@admin_required
def update_user(uid):
    data = request.get_json()
    try:
        if 'email' in data: auth.update_user(uid, email=data['email'])
        
        # LÓGICA ALTERADA: Monta um objeto de atualização para o nó do usuário
        db_updates = {
            'nome': data.get('nome'),
            'role': data.get('role'),
            'email': data.get('email'),
            'accessible_pages': data.get('accessible_pages'),
            'permissions': data.get('permissions') # Salva as permissões no usuário
        }
        
        # Filtra valores None para não apagar campos existentes sem querer
        updates_filtradas = {k: v for k, v in db_updates.items() if v is not None}
        
        db.reference(f'usuarios/{uid}').update(updates_filtradas)

        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"error": f"Erro ao atualizar usuário: {str(e)}"}), 500


# As funções abaixo não precisam de alteração, pois apenas leem nomes e roles
@usuarios_bp.route('/<string:uid>', methods=['DELETE'])
@admin_required
def delete_user(uid):
    try:
        auth.delete_user(uid)
        db.reference(f'usuarios/{uid}').delete()
        return jsonify({"status": "success"})
    except Exception as e:
        return jsonify({"error": f"Erro ao excluir usuário: {str(e)}"}), 500

@usuarios_bp.route('/<string:uid>/set-password', methods=['POST'])
@admin_required
def set_user_password(uid):
    data = request.get_json()
    new_password = data.get('password')
    if not new_password or len(new_password) < 6:
        return jsonify({"error": "A senha é obrigatória e deve ter no mínimo 6 caracteres."}), 400
    try:
        auth.update_user(uid, password=new_password)
        return jsonify({"status": "success", "message": "Senha atualizada com sucesso."})
    except Exception as e:
        return jsonify({"error": f"Erro ao definir a senha: {str(e)}"}), 500

@usuarios_bp.route('/comprador-nomes', methods=['GET'])
def get_comprador_nomes():
    try:
        users = db.reference('usuarios').order_by_child('role').equal_to('Comprador').get() or {}
        nomes = sorted([u['nome'] for u in users.values() if 'nome' in u])
        return jsonify(nomes)
    except Exception as e: return jsonify({"error": str(e)}), 500

@usuarios_bp.route('/separador-nomes', methods=['GET'])
def get_separador_nomes():
    try:
        users = db.reference('usuarios').order_by_child('role').equal_to('Separador').get() or {}
        nomes = sorted([
            u['nome'] for u in users.values() 
            if 'nome' in u and u['nome'].lower() != 'separacao'
        ])
        return jsonify(nomes)
    except Exception as e: return jsonify({"error": str(e)}), 500

@usuarios_bp.route('/vendedor-nomes', methods=['GET'])
def get_vendedor_nomes():
    try:
        users = db.reference('usuarios').order_by_child('role').equal_to('Vendedor').get() or {}
        nomes = sorted([u['nome'] for u in users.values() if 'nome' in u])
        return jsonify(nomes)
    except Exception as e: return jsonify({"error": str(e)}), 500

# ****** INÍCIO DA CORREÇÃO ******
@usuarios_bp.route('/expedicao-nomes', methods=['GET'])
def get_expedicao_nomes():
    try:
        users = db.reference('usuarios').order_by_child('role').equal_to('Expedição').get() or {}
        # Adiciona um filtro para ignorar o usuário 'expedicao' (case-insensitive)
        nomes = sorted([
            u['nome'] for u in users.values() 
            if 'nome' in u and u['nome'].lower() != 'expedicao'
        ])
        return jsonify(nomes)
    except Exception as e: return jsonify({"error": str(e)}), 500
# ****** FIM DA CORREÇÃO ******

@usuarios_bp.route('/estoquista-nomes', methods=['GET'])
def get_estoquista_nomes():
    try:
        users = db.reference('usuarios').order_by_child('role').equal_to('Estoque').get() or {}
        nomes = sorted([u['nome'] for u in users.values() if 'nome' in u])
        return jsonify(nomes)
    except Exception as e: return jsonify({"error": str(e)}), 500