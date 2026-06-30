# quadro_app/__init__.py

import sys
import os
import time
import secrets
from flask import Flask, request, jsonify, session, redirect, url_for
from flask_socketio import SocketIO, join_room # <-- ADICIONADO: join_room
from flask_migrate import Migrate
from werkzeug.middleware.proxy_fix import ProxyFix
from datetime import datetime
from sqlalchemy import text
from .extensions import db, tz_cuiaba
from .blueprints.listas_dinamicas import garantir_listas_padrao


def _garantir_schema_campanhas_ajuste():
    """
    db.create_all() nao adiciona colunas novas em tabelas existentes.
    Garante que ajuste_estoque tem campanha_id mesmo em bancos ja populados.
    """
    engine = db.engine
    with engine.connect() as conn:
        cols = [row[1] for row in conn.execute(text("PRAGMA table_info(ajuste_estoque)"))]
        if 'campanha_id' not in cols:
            conn.execute(text("ALTER TABLE ajuste_estoque ADD COLUMN campanha_id INTEGER"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_ajuste_estoque_campanha_id ON ajuste_estoque(campanha_id)"))
            conn.commit()


def _garantir_coluna_prioridade_conferencia():
    """
    db.create_all() nao adiciona colunas novas em tabelas existentes.
    Garante que conferencia tem a coluna 'prioridade' mesmo em bancos ja populados.
    Lancamentos legados ficam com prioridade NULL (nao aparecem no Kanban/TV).
    """
    engine = db.engine
    with engine.connect() as conn:
        cols = [row[1] for row in conn.execute(text("PRAGMA table_info(conferencia)"))]
        if 'prioridade' not in cols:
            conn.execute(text("ALTER TABLE conferencia ADD COLUMN prioridade VARCHAR(30)"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_conferencia_prioridade ON conferencia(prioridade)"))
            conn.commit()
        if 'prioridade_definida_em' not in cols:
            conn.execute(text("ALTER TABLE conferencia ADD COLUMN prioridade_definida_em VARCHAR(100)"))
            conn.commit()


def _migrar_ajustes_legado():
    """
    Se existirem ajustes sem campanha, cria/reutiliza uma campanha 'Legado' finalizada
    e vincula todos os ajustes orfaos a ela.
    """
    from .models import AjusteEstoque, CampanhaAjuste
    orfaos = AjusteEstoque.query.filter(AjusteEstoque.campanha_id.is_(None)).count()
    if not orfaos:
        return
    legado = CampanhaAjuste.query.filter_by(nome='Legado').first()
    if not legado:
        agora = datetime.now(tz_cuiaba).isoformat()
        legado = CampanhaAjuste(
            nome='Legado',
            status='Finalizada',
            observacao='Ajustes anteriores ao sistema de campanhas.',
            criado_por='Sistema',
            criado_por_id='sistema',
            data_inicio=agora,
            data_fim=agora,
            finalizado_por='Sistema',
            finalizado_por_id='sistema',
        )
        db.session.add(legado)
        db.session.flush()
    AjusteEstoque.query.filter(AjusteEstoque.campanha_id.is_(None)).update(
        {AjusteEstoque.campanha_id: legado.id}, synchronize_session=False
    )
    db.session.commit()

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

    # Confia nos headers X-Forwarded-* enviados pelo nginx (HTTPS termina no nginx).
    # Sem isso, Flask acha que requisicoes vem em HTTP e gera redirects http://
    # causando Mixed Content no navegador quando acessado via HTTPS.
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)

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
    from .blueprints.estoque import estoque_bp
    from .blueprints.retiradas import retiradas_bp
    from .blueprints.anotacoes import anotacoes_bp
    from .blueprints.separacoes_canceladas import separacoes_canceladas_bp
    from .blueprints.clientes import clientes_bp

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
    app.register_blueprint(estoque_bp)
    app.register_blueprint(retiradas_bp)
    app.register_blueprint(anotacoes_bp)
    app.register_blueprint(separacoes_canceladas_bp)
    app.register_blueprint(clientes_bp)

    # Garante que a pasta de uploads de fotos de pecas existe
    os.makedirs(os.path.join(app.static_folder, 'uploads', 'pecas'), exist_ok=True)

    # Criação das tabelas e carregamento de listas padrão
    with app.app_context():
        from . import models
        db.create_all()
        _garantir_schema_campanhas_ajuste()
        _garantir_coluna_prioridade_conferencia()
        _migrar_ajustes_legado()
        garantir_listas_padrao()

    # Monitor de escalonamento automático de prioridades (sobe nível após 48h).
    from .blueprints.conferencias import iniciar_monitor_prioridades
    iniciar_monitor_prioridades(app)

    return app, socketio, TV_MODE