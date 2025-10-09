# quadro_app/__init__.py
import sys
import os
import time
from datetime import timezone, timedelta
from flask import Flask
import firebase_admin
from firebase_admin import credentials, db as firebase_db

tz_cuiaba = timezone(timedelta(hours=-4))
db = None 

def resource_path(relative_path):
    """ Obtém o caminho absoluto para o recurso, funciona para dev e para PyInstaller """
    try:
        base_path = sys._MEIPASS
    except Exception:
        base_path = os.path.abspath(".")
    return os.path.join(base_path, relative_path)

def create_app():
    global db
    
    TV_MODE = '--tv' in sys.argv
    if TV_MODE:
        print("MODO TV ATIVADO.")

    try:
        cred = credentials.Certificate(resource_path('serviceAccountKey.json'))
        firebase_admin.initialize_app(cred, {
            'databaseURL': 'https://quadro-de-servicos-berti-default-rtdb.firebaseio.com'
        })
        db = firebase_db
    except Exception as e:
        print(f"ERRO CRÍTICO: Não foi possível inicializar o Firebase Admin SDK: {e}")
        sys.exit(1)

    app = Flask(__name__,
                static_folder=resource_path('static'),
                template_folder=resource_path('templates'))

    app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0

    @app.context_processor
    def inject_global_vars():
        return dict(tv_mode=TV_MODE, cache_id=int(time.time()))

    # --- INÍCIO DA CORREÇÃO ---
    # Importe TODOS os seus blueprints aqui, antes de registrá-los.
    from .blueprints.main_views import main_views_bp
    from .blueprints.pedidos import pedidos_bp
    from .blueprints.sugestoes import sugestoes_bp
    from .blueprints.dashboard import dashboard_bp
    from .blueprints.usuarios import usuarios_bp
    from .blueprints.separacoes import separacoes_bp
    from .blueprints.configuracoes import config_bp
    from .blueprints.conferencias import conferencias_bp
    
    # Agora que foram importados, podemos registrá-los.
    app.register_blueprint(usuarios_bp)
    app.register_blueprint(main_views_bp)
    app.register_blueprint(pedidos_bp)
    app.register_blueprint(sugestoes_bp)
    app.register_blueprint(dashboard_bp)
    app.register_blueprint(separacoes_bp)
    app.register_blueprint(config_bp)
    app.register_blueprint(conferencias_bp)
    # --- FIM DA CORREÇÃO ---
    
    # Retorna None para os valores que não usamos mais na versão de servidor
    return app, None, TV_MODE