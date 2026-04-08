# quadro_app/__init__.py

import sys
import os
import time
import secrets
from flask import Flask, request, jsonify, session, redirect, url_for
from flask_socketio import SocketIO, join_room # <-- ADICIONADO: join_room
from flask_migrate import Migrate
from .extensions import db
from .blueprints.listas_dinamicas import garantir_listas_padrao

# Inicializamos o SocketIO globalmente para que possa ser importado nos Blueprints
# cors_allowed_origins="*" garante que não haja bloqueio de conexão no navegador
socketio = SocketIO(cors_allowed_origins="*")

def create_app():
    # Define caminhos absolutos para static e templates
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    
    app = Flask(__name__,
                static_folder=os.path.join(project_root, 'static'),
                template_folder=os.path.join(project_root, 'templates'))
    
    # Chave secreta persistente para assinar os cookies de sessão
    secret_key_file = os.path.join(project_root, '.secret_key')
    if os.path.exists(secret_key_file):
        with open(secret_key_file, 'rb') as f:
            app.config['SECRET_KEY'] = f.read()
    else:
        key = secrets.token_bytes(32)
        with open(secret_key_file, 'wb') as f:
            f.write(key)
        app.config['SECRET_KEY'] = key

    # Configuração do Banco de Dados SQLite
    db_path = os.path.join(project_root, 'quadro_local.db')
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + db_path
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0

    # Inicialização das extensões no App
    db.init_app(app)
    socketio.init_app(app)
    migrate = Migrate(app, db)
    
    # Variáveis globais para os templates (Modo TV e Cache Buster para CSS/JS)
    TV_MODE = '--tv' in sys.argv
    @app.context_processor
    def inject_global_vars():
        return dict(tv_mode=TV_MODE, cache_id=int(time.time()))

    # --- HANDLER DE ERROS ---
    @app.errorhandler(403)
    def acesso_negado(e):
        return redirect(url_for('main_views.inicio') + '?acesso_negado=1')

    # --- PROTEÇÃO DAS ROTAS DE API ---
    @app.before_request
    def verificar_autenticacao():
        if request.path.startswith('/api/'):
            # Rotas públicas que não exigem sessão
            rotas_publicas = {'/api/usuarios/login'}
            if request.path in rotas_publicas:
                return None
            if 'user_id' not in session:
                return jsonify({'error': 'Não autorizado. Faça login para continuar.'}), 401

    # --- REGISTRO DE EVENTOS SOCKET.IO ---
    
    @socketio.on('join')
    def on_join(data):
        """
        Evento chamado pelo frontend logo após o login.
        Coloca o usuário em uma 'sala' privada baseada no seu ID.
        """
        user_id = data.get('user_id')
        if user_id:
            join_room(user_id)
            # print(f"DEBUG: Usuário {user_id} ingressou na sala privada.")

    # --- REGISTRO DE BLUEPRINTS ---

    from .blueprints.main_views import main_views_bp
    from .blueprints.pedidos import pedidos_bp
    from .blueprints.sugestoes import sugestoes_bp
    from .blueprints.dashboard import dashboard_bp
    from .blueprints.usuarios import usuarios_bp
    from .blueprints.separacoes import separacoes_bp
    from .blueprints.configuracoes import config_bp
    from .blueprints.conferencias import conferencias_bp
    from .blueprints.notificacoes import notificacoes_bp
    from .blueprints.logs import logs_bp
    from .blueprints.lixeira import lixeira_bp
    from .blueprints.listas_dinamicas import listas_bp
    from .blueprints.registro_compras import compras_registro_bp

    app.register_blueprint(main_views_bp)
    app.register_blueprint(pedidos_bp)
    app.register_blueprint(sugestoes_bp)
    app.register_blueprint(dashboard_bp)
    app.register_blueprint(usuarios_bp)
    app.register_blueprint(separacoes_bp)
    app.register_blueprint(config_bp)
    app.register_blueprint(conferencias_bp)
    app.register_blueprint(notificacoes_bp)
    app.register_blueprint(logs_bp)
    app.register_blueprint(lixeira_bp)
    app.register_blueprint(listas_bp)
    app.register_blueprint(compras_registro_bp)

    # Criação das tabelas e carregamento de listas padrão
    with app.app_context():
        from . import models
        db.create_all()
        garantir_listas_padrao()

    return app, socketio, TV_MODE