from quadro_app import create_app, db
from quadro_app.models import Usuario
from werkzeug.security import generate_password_hash

# --- CONFIGURAÇÃO ---
ADMIN_EMAIL = "admin@tratormax.net.br" # Coloque o email exato do seu usuário admin
NOVA_SENHA = "102030"                  # Escolha uma nova senha forte
# --------------------

app, _, _ = create_app()
with app.app_context():
    # Encontra o usuário admin pelo email
    admin_user = Usuario.query.filter_by(email=ADMIN_EMAIL).first()

    if not admin_user:
        print(f"ERRO: Usuário com email '{ADMIN_EMAIL}' não encontrado no banco de dados.")
    else:
        try:
            # Gera o hash da nova senha e o atribui ao usuário
            admin_user.password_hash = generate_password_hash(NOVA_SENHA)
            db.session.commit()
            print(f"Sucesso! A senha para o usuário '{admin_user.nome}' ({ADMIN_EMAIL}) foi definida.")
            print(f"Agora você pode fazer login com a senha: {NOVA_SENHA}")
        except Exception as e:
            db.session.rollback()
            print(f"ERRO ao tentar definir a senha: {e}")