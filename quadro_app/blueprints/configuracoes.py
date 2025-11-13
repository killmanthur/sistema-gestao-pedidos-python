# quadro_app/blueprints/configuracoes.py
from flask import Blueprint, request, jsonify
from quadro_app import db

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

# --- INÍCIO DA ALTERAÇÃO ---
PERMISSOES_PENDENCIAS_VALIDAS = [
    "pode_editar_pendencia",
    "pode_resolver_pendencia_conferencia",
    "pode_reiniciar_conferencia_historico",
    "pode_editar_pedido_a_caminho" # <-- NOVA PERMISSÃO AQUI
]
# --- FIM DA ALTERAÇÃO ---


@config_bp.route('/permissoes', methods=['GET'])
def get_permissoes():
    try:
        return jsonify({}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@config_bp.route('/permissoes', methods=['PUT'])
def set_permissoes():
    dados = request.get_json()
    try:
        print("AVISO: A rota set_permissoes não tem efeito no banco de dados local.")
        return jsonify({'status': 'success', 'message': 'A rota foi chamada, mas nenhuma permissão foi alterada (lógica obsoleta).'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500