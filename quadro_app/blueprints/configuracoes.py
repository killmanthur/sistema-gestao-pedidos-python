# quadro_app/blueprints/configuracoes.py
from flask import Blueprint, request, jsonify

config_bp = Blueprint('configuracoes', __name__, url_prefix='/api/configuracoes')

ROLES_VALIDAS = ["Admin", "Comprador", "Vendedor", "Estoque", "Expedição", "Recepção", "Separador", "Contabilidade"]

PERMISSOES_SEPARACAO_VALIDAS = [
    "pode_criar_separacao", "pode_editar_separacao", "pode_deletar_separacao",
    "pode_ver_todas_separacoes", "pode_enviar_para_conferencia",
    "pode_finalizar_separacao", "pode_editar_separacao_finalizada",
    "pode_gerenciar_observacao_separacao"
]

PERMISSOES_SUGESTOES_VALIDAS = ["pode_editar_sugestao_finalizada"]

PERMISSOES_CONFERENCIA_VALIDAS = ["pode_deletar_conferencia"]

PERMISSOES_PENDENCIAS_VALIDAS = [
    "pode_editar_pendencia",
    "pode_resolver_pendencia_conferencia",
    "pode_reiniciar_conferencia_historico",
    "pode_editar_pedido_a_caminho"
]

# Nota: As permissões de páginas (accessible_pages) são gerenciadas dinamicamente 
# baseadas nas chaves enviadas pelo frontend.

@config_bp.route('/permissoes', methods=['GET'])
def get_permissoes():
    # Esta rota pode ser usada para retornar as chaves válidas para o frontend se necessário
    return jsonify({
        "roles": ROLES_VALIDAS,
        "separacao": PERMISSOES_SEPARACAO_VALIDAS,
        "sugestoes": PERMISSOES_SUGESTOES_VALIDAS,
        "conferencia": PERMISSOES_CONFERENCIA_VALIDAS,
        "pendencias": PERMISSOES_PENDENCIAS_VALIDAS
    }), 200

@config_bp.route('/permissoes', methods=['PUT'])
def set_permissoes():
    # Lógica obsoleta para banco local, as permissões agora são salvas no modelo Usuario
    return jsonify({'status': 'success', 'message': 'As permissões são gerenciadas via endpoint de usuários.'}), 200