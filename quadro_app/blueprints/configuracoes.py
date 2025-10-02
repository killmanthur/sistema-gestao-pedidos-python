# quadro_app/blueprints/configuracoes.py
from flask import Blueprint, request, jsonify
from quadro_app import db
from .usuarios import admin_required # Reutiliza o decorador de admin

config_bp = Blueprint('configuracoes', __name__, url_prefix='/api/configuracoes')

# MUDANÇA: Adicionada a nova role "Recepção"
ROLES_VALIDAS = ["Admin", "Comprador", "Vendedor", "Estoque", "Expedição", "Recepção", "Separador"]

PERMISSOES_SEPARACAO_VALIDAS = [
    "pode_criar_separacao",
    "pode_editar_separacao",
    "pode_deletar_separacao",
    "pode_ver_todas_separacoes",
    "pode_enviar_para_conferencia",
    "pode_finalizar_separacao",
    "pode_editar_separacao_finalizada",
    "pode_gerenciar_observacao_separacao"
]
PERMISSOES_SUGESTOES_VALIDAS = [
    "pode_editar_sugestao_finalizada"
]

PERMISSOES_CONFERENCIA_VALIDAS = [
    "pode_editar_conferencia",
    "pode_deletar_conferencia",
    "pode_ver_botoes_conferencia_finalizada"
]

@config_bp.route('/permissoes', methods=['GET'])
@admin_required
def get_permissoes():
    try:
        ref = db.reference('configuracoes/permissoes_roles')
        permissoes = ref.get()
        if not permissoes:
            return jsonify({}), 200
        return jsonify(permissoes), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@config_bp.route('/permissoes', methods=['PUT'])
@admin_required
def set_permissoes():
    dados = request.get_json()
    try:
        permissoes_validadas = {}
        # MUDANÇA: Inclui as novas permissões na validação
        todas_permissoes_validas = PERMISSOES_SEPARACAO_VALIDAS + PERMISSOES_SUGESTOES_VALIDAS + PERMISSOES_CONFERENCIA_VALIDAS

        for role, perms in dados.items():
            if role in ROLES_VALIDAS:
                permissoes_validadas[role] = {}
                if isinstance(perms, dict):
                    for perm_key, perm_value in perms.items():
                        if perm_key in todas_permissoes_validas and isinstance(perm_value, bool):
                            permissoes_validadas[role][perm_key] = perm_value
        
        ref = db.reference('configuracoes/permissoes_roles')
        ref.update(permissoes_validadas)
        return jsonify({'status': 'success', 'message': 'Permissões salvas com sucesso!'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500