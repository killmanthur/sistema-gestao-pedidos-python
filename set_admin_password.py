# set_admin_password.py
import uuid
from werkzeug.security import generate_password_hash
from quadro_app import create_app, db
from quadro_app.models import Usuario
from quadro_app.blueprints.listas_dinamicas import garantir_listas_padrao

def setup_initial_admin():
    app, socketio, tv_mode = create_app()

    with app.app_context():
        # 1. Garante que as tabelas existam
        print("Verificando tabelas do banco de dados...")
        db.create_all()

        # 2. Garante que as listas dinâmicas (Vendedores, Compradores, etc) sejam iniciadas
        print("Inicializando listas dinâmicas padrão...")
        garantir_listas_padrao()

        # 3. Configurações do Administrador
        admin_email = "admin@tratormax.net.br"
        admin_nome = "Administrador Sistema"
        admin_senha = "admin123"  # <--- ALTERE ESTA SENHA APÓS O PRIMEIRO LOGIN

        # Verifica se já existe
        user = Usuario.query.filter_by(email=admin_email).first()

        if user:
            print(f"O usuário {admin_email} já existe. Atualizando senha e permissões...")
            user.password_hash = generate_password_hash(admin_senha)
        else:
            print(f"Criando novo usuário administrador: {admin_email}...")
            user = Usuario(
                id=str(uuid.uuid4()),
                email=admin_email,
                nome=admin_nome,
                role="Admin",
                password_hash=generate_password_hash(admin_senha)
            )
            db.session.add(user)

        # 4. Define Acesso Total a todas as páginas do sistema
        user.accessible_pages = [
            "quadro", "pedidos_a_caminho", "historico", "historico_conferencias",
            "criar_pedido", "atualizacao_orcamento", "registro_compras",
            "sugestoes", "dashboard", "dashboard_logistica", "dashboard_conferencias",
            "recebimento", "conferencias", "pendencias_e_alteracoes", "separacoes",
            "tv_expedicao", "gerenciar_separacoes", "admin_sistema", "lixeira"
        ]

        # 5. Define todas as permissões operacionais como True
        user.permissions = {
            # Separações
            "pode_criar_separacao": True,
            "pode_editar_separacao": True,
            "pode_deletar_separacao": True,
            "pode_enviar_para_conferencia": True,
            "pode_finalizar_separacao": True,
            "pode_ver_todas_separacoes": True,
            "pode_editar_separacao_finalizada": True,
            "pode_gerenciar_observacao_separacao": True,
            # Sugestões
            "pode_editar_sugestao_finalizada": True,
            # Conferência / Recebimento
            "pode_deletar_conferencia": True,
            "pode_editar_pendencia": True,
            "pode_resolver_pendencia_conferencia": True,
            "pode_reiniciar_conferencia_historico": True,
            "pode_editar_pedido_a_caminho": True
        }

        try:
            db.session.commit()
            print("\n" + "="*40)
            print(" ADMIN CONFIGURADO COM SUCESSO!")
            print(f" Usuário: {admin_email}")
            print(f" Senha: {admin_senha}")
            print("="*40)
            print("Lembre-se de alterar a senha no primeiro acesso.")
        except Exception as e:
            db.session.rollback()
            print(f"Erro ao salvar: {e}")

if __name__ == "__main__":
    setup_initial_admin()