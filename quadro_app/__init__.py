# quadro_app/__init__.py
import sys
import os
import time
from datetime import timezone, timedelta
from flask import Flask
import webview
import firebase_admin
from firebase_admin import credentials, db as firebase_db

tz_cuiaba = timezone(timedelta(hours=-4))
db = None 

def resource_path(relative_path):
    try:
        base_path = sys._MEIPASS
    except Exception:
        base_path = os.path.abspath(".")
    return os.path.join(base_path, relative_path)

class Api:
    def __init__(self):
        self._window = None
    def set_window(self, window):
        self._window = window

    # MUDANÇA: As funções flash_window e stop_flash_window foram removidas
    
    def save_file_dialog(self, content):
        try:
            from datetime import datetime
            default_filename = f"relatorio_pedidos_{datetime.now(tz_cuiaba).strftime('%Y-%m-%d')}.txt"
            if not self._window:
                raise Exception("A janela da aplicação não foi inicializada corretamente.")
            result = self._window.create_file_dialog(
                webview.SAVE_DIALOG, directory='/', save_filename=default_filename
            )
            if result and isinstance(result, tuple) and len(result) > 0 and result[0]:
                filepath = result[0]
            elif result and isinstance(result, str):
                filepath = result
            else:
                return {'status': 'cancelled', 'message': 'Operação cancelada.'}
            
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)
            return {'status': 'success', 'message': f'Relatório salvo em: {filepath}'}
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

def create_app():
    global db
    
    TV_MODE = '--tv' in sys.argv
    if TV_MODE:
        print("MODO TV ATIVADO.")

    try:
        cred = credentials.Certificate('serviceAccountKey.json')
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

    @app.context_processor
    def inject_global_vars():
        return dict(tv_mode=TV_MODE, cache_id=int(time.time()))

    from .blueprints.main_views import main_views_bp
    from .blueprints.pedidos import pedidos_bp
    from .blueprints.sugestoes import sugestoes_bp
    from .blueprints.dashboard import dashboard_bp
    from .blueprints.usuarios import usuarios_bp
    from .blueprints.separacoes import separacoes_bp
    from .blueprints.configuracoes import config_bp
    
    app.register_blueprint(usuarios_bp)
    app.register_blueprint(main_views_bp)
    app.register_blueprint(pedidos_bp)
    app.register_blueprint(sugestoes_bp)
    app.register_blueprint(dashboard_bp)
    app.register_blueprint(separacoes_bp)
    app.register_blueprint(config_bp)

    api_instance = Api()
    
    return app, api_instance, TV_MODE