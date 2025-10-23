import sys
import os
import time
from datetime import timezone, timedelta
from flask import Flask
from flask_sqlalchemy import SQLAlchemy

# Remover referências ao Firebase
# import firebase_admin
# from firebase_admin import credentials, db as firebase_db

tz_cuiaba = timezone(timedelta(hours=-4))
db = SQLAlchemy()

def resource_path(relative_path):
    try:
        base_path = sys._MEIPASS
    except Exception:
        base_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    return os.path.join(base_path, relative_path)

def create_app():
    app = Flask(__name__,
                static_folder=resource_path('static'),
                template_folder=resource_path('templates'))

    # --- CONFIGURAÇÃO DO BANCO DE DADOS LOCAL ---
    db_path = resource_path('quadro_local.db')
    print(f"Banco de dados será criado em: {db_path}") # Para depuração
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + db_path
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

    db.init_app(app)
    # --- FIM DA CONFIGURAÇÃO ---

    TV_MODE = '--tv' in sys.argv
    @app.context_processor
    def inject_global_vars():
        return dict(tv_mode=TV_MODE, cache_id=int(time.time()))

    # Importa e registra os blueprints
    from .blueprints.main_views import main_views_bp
    from .blueprints.pedidos import pedidos_bp
    from .blueprints.sugestoes import sugestoes_bp
    from .blueprints.dashboard import dashboard_bp
    from .blueprints.usuarios import usuarios_bp
    from .blueprints.separacoes import separacoes_bp
    from .blueprints.configuracoes import config_bp
    from .blueprints.conferencias import conferencias_bp
    
    app.register_blueprint(main_views_bp)
    app.register_blueprint(pedidos_bp)
    app.register_blueprint(sugestoes_bp)
    app.register_blueprint(dashboard_bp)
    app.register_blueprint(usuarios_bp)
    app.register_blueprint(separacoes_bp)
    app.register_blueprint(config_bp)
    app.register_blueprint(conferencias_bp)

    # Cria as tabelas no banco de dados se não existirem
    with app.app_context():
        # Importa os modelos aqui para evitar importação circular
        from . import models
        db.create_all()

    return app, None, TV_MODE