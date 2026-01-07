import uuid
from werkzeug.security import generate_password_hash
from quadro_app import db, create_app
from quadro_app.models import Usuario
from quadro_app.blueprints.listas_dinamicas import garantir_listas_padrao

def setup_initial_admin():
    app, socketio, tv_mode = create_app()
    with app.app_context():
        print ('Verificando tabelas do banco de dados...')
        db.create_all()

        print ('Inicializando listas dinâmicas padrão...')
        garantir_listas_padrao()

        admin_email = 'admin@tratormax.net.br'
        admin_nome = 'Administrador Sistema'
        admin_senha = 'admin123'

        user = Usuario.query.filter_by(email=admin_email).first()

        if user:
            print(f'Usuário administrador já existe: {admin_email}')
        else:
            print(f'Criando usuário administrador: {admin_email}')
            novo_admin = Usuario(
                id=str(uuid.uuid4()),
                nome=admin_nome,
                email=admin_email,
                senha=generate_password_hash(admin_senha),
                is_admin=True
            )
            db.session.add(user)
            db.session.commit()
            print(f'Usuário administrador criado com sucesso: {admin_email} / Senha: {admin_senha}')
        
        user.acessible_pages = [
            'admin_sistema',
        ]

        try:
            db.session.commit()
            print('\n' + '=' * 40)
            print('Configuração inicial concluída com sucesso!')
        
        except Exception as e:
            db.session.rollback()
            print('Erro ao configurar o usuário administrador:', str(e))
    
if __name__ == '__main__':
    setup_initial_admin()