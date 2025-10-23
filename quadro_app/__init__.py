import sys
import os
import time
from datetime import timezone, timedelta
from flask import Flask
from flask_sqlalchemy import SQLAlchemy

tz_cuiaba = timezone(timedelta(hours=-4))
db = SQLAlchemy()

# Não precisamos mais da função 'resource_path' aqui.

def create_app():
    # --- INÍCIO DA CORREÇÃO PARA MODO SERVIDOR ---
    # Constrói caminhos absolutos para as pastas 'static' e 'templates'
    # baseando-se na localização deste arquivo (__init__.py).
    # Isso garante que o Flask sempre as encontre, não importa de onde o script 'run.py' é chamado.
    
    # __file__ é o caminho para o arquivo atual (quadro_app/__init__.py)
    # os.path.dirname(__file__) nos dá a pasta 'quadro_app'
    # os.path.join(..., '..') sobe um nível para a raiz do projeto
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    
    app = Flask(__name__,
                static_folder=os.path.join(project_root, 'static'),
                template_folder=os.path.join(project_root, 'templates'))
    
    # --- FIM DA CORREÇÃO ---

    # --- CONFIGURAÇÃO DO BANCO DE DADOS LOCAL ---
    # O banco de dados será criado na raiz do projeto.
    db_path = os.path.join(project_root, 'quadro_local.db')
    print(f"Banco de dados localizado em: {db_path}") # Para depuração
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + db_path
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

    db.init_app(app)
    
    TV_MODE = '--tv' in sys.argv
    @app.context_processor
    def inject_global_vars():
        return dict(tv_mode=TV_MODE, cache_id=int(time.time()))

    # Importa e registra os blueprints (nenhuma mudança aqui)
    from .blueprints.main_views import main_views_bp
    from .blueprints.pedidos import pedidos_bp
    from .blueprints.sugestoes import sugestoes_bp
    from .blueprints.dashboard import dashboard_bp
    from .blueprints.usuarios import usuarios_bp
    from .blueprints.separacoes import separacoes_bp
    from .blueprints.configuracoes import config_bp
    from .blueprints.conferencias import conferencias_bp
    from .blueprints.notificacoes import notificacoes_bp

    app.register_blueprint(main_views_bp)
    app.register_blueprint(pedidos_bp)
    app.register_blueprint(sugestoes_bp)
    app.register_blueprint(dashboard_bp)
    app.register_blueprint(usuarios_bp)
    app.register_blueprint(separacoes_bp)
    app.register_blueprint(config_bp)
    app.register_blueprint(conferencias_bp)
    app.register_blueprint(notificacoes_bp)

    # Cria as tabelas no banco de dados se não existirem
    with app.app_context():
        from . import models
        db.create_all()

    return app, None, TV_MODE