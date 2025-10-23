# quadro_app/blueprints/configuracoes.py
from flask import Blueprint, request, jsonify
from quadro_app import db
# REMOVIDO: from .usuarios import admin_required

config_bp = Blueprint('configuracoes', __name__, url_prefix='/api/configuracoes')

# (Suas constantes de ROLES_VALIDAS e PERMISSOES... continuam aqui)
ROLES_VALIDAS = ["Admin", "Comprador", "Vendedor", "Estoque", "Expedição", "Recepção", "Separador", "Contabilidade"]
PERMISSOES_SEPARACAO_VALIDAS = [
    "pode_criar_separacao", "pode_editar_separacao", "pode_deletar_separacao",
    "pode_ver_todas_separacoes", "pode_enviar_para_conferencia",
    "pode_finalizar_separacao", "pode_editar_separacao_finalizada",
    "pode_gerenciar_observacao_separacao"
]
PERMISSOES_SUGESTOES_VALIDAS = ["pode_editar_sugestao_finalizada"]
PERMISSOES_CONFERENCIA_VALIDAS = ["pode_deletar_conferencia"]
PERMISSOES_PENDENCIAS_VALIDAS = ["pode_editar_pendencia"]


@config_bp.route('/permissoes', methods=['GET'])
# @admin_required # <-- Comentado/Removido
def get_permissoes():
    # ATENÇÃO: Esta rota agora está DESPROTEGIDA.
    # Em produção, você precisaria adicionar um novo mecanismo de segurança.
    # Por enquanto, para a migração, vamos remover a referência ao banco Firebase.
    try:
        # A lógica de buscar do Firebase precisa ser adaptada ou removida.
        # Por simplicidade, retornaremos um objeto vazio, já que as permissões agora
        # estão no modelo Usuario.
        return jsonify({}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@config_bp.route('/permissoes', methods=['PUT'])
# @admin_required # <-- Comentado/Removido
def set_permissoes():
    # ATENÇÃO: Esta rota agora está DESPROTEGIDA.
    dados = request.get_json()
    try:
        # Esta lógica se comunicava com 'configuracoes/permissoes_roles' no Firebase.
        # Com a nova estrutura, as permissões são por usuário.
        # Esta rota se torna obsoleta ou precisaria ser completamente reescrita
        # para aplicar permissões em massa, o que é mais complexo.
        print("AVISO: A rota set_permissoes não tem efeito no banco de dados local.")
        return jsonify({'status': 'success', 'message': 'A rota foi chamada, mas nenhuma permissão foi alterada (lógica obsoleta).'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500