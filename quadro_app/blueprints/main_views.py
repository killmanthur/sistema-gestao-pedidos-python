# quadro_app/blueprints/main_views.py
from functools import wraps
from flask import Blueprint, render_template, redirect, url_for, session, abort
from quadro_app.models import Usuario

main_views_bp = Blueprint('main_views', __name__)


def login_required(f):
    """Garante que o usuário está autenticado via sessão do servidor."""
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user_id' not in session:
            return redirect(url_for('main_views.login_page'))
        return f(*args, **kwargs)
    return decorated


def page_access_required(page_key):
    """Garante que o usuário tem acesso à página indicada por page_key.
    Admins sempre têm acesso. Usuários não autorizados recebem 403.
    """
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            if 'user_id' not in session:
                return redirect(url_for('main_views.login_page'))
            usuario = Usuario.query.get(session['user_id'])
            if usuario is None:
                session.clear()
                return redirect(url_for('main_views.login_page'))
            is_admin = usuario.role == 'Admin'
            has_page = usuario.accessible_pages and page_key in usuario.accessible_pages
            if not is_admin and not has_page:
                abort(403)
            return f(*args, **kwargs)
        return decorated
    return decorator


@main_views_bp.route('/')
def index():
    return redirect(url_for('main_views.login_page'))

@main_views_bp.route('/login')
def login_page():
    return render_template('login.html')

@main_views_bp.route('/inicio')
@login_required
def inicio():
    return render_template('inicio.html')

@main_views_bp.route('/quadro')
@page_access_required('quadro')
def quadro():
    return render_template('quadro.html')

@main_views_bp.route('/pedidos-a-caminho')
@page_access_required('pedidos_a_caminho')
def pedidos_a_caminho_page():
    return render_template('pedidos_a_caminho.html')

@main_views_bp.route('/criar-pedido')
@page_access_required('criar_pedido')
def criar_pedido_form():
    return render_template('criar_pedido.html')

@main_views_bp.route('/historico')
@page_access_required('historico')
def historico():
    return render_template('historico.html')

@main_views_bp.route('/atualizacao-orcamento')
@page_access_required('atualizacao_orcamento')
def atualizacao_orcamento_form():
    return render_template('atualizacao_orcamento.html')

@main_views_bp.route('/sugestoes')
@page_access_required('sugestoes')
def sugestoes_page():
    return render_template('sugestoes.html')

@main_views_bp.route('/historico-sugestoes')
@page_access_required('historico_sugestoes')
def historico_sugestoes_page():
    return render_template('historico_sugestoes.html')

@main_views_bp.route('/dashboard')
@page_access_required('dashboard')
def dashboard_page():
    return render_template('dashboard.html')

@main_views_bp.route('/dashboard-logistica')
@page_access_required('dashboard_logistica')
def dashboard_logistica_page():
    return render_template('dashboard_logistica.html')

@main_views_bp.route('/separacoes')
@page_access_required('separacoes')
def separacoes_page():
    return render_template('separacoes.html')

@main_views_bp.route('/conferencias')
@page_access_required('conferencias')
def conferencias_page():
    return render_template('conferencias.html')

@main_views_bp.route('/dashboard-conferencias')
@page_access_required('dashboard_conferencias')
def dashboard_conferencias_page():
    return render_template('dashboard_conferencias.html')

@main_views_bp.route('/historico-conferencias')
@page_access_required('historico_conferencias')
def historico_conferencias_page():
    return render_template('historico_conferencias.html')

@main_views_bp.route('/recebimento')
@page_access_required('recebimento')
def recebimento_page():
    return render_template('recebimento.html')

@main_views_bp.route('/gerenciar-separacoes')
@page_access_required('gerenciar_separacoes')
def gerenciar_separacoes_page():
    return render_template('gerenciar_separacoes.html')

@main_views_bp.route('/admin/sistema')
@page_access_required('admin_sistema')
def gerenciar_sistema_page():
    return render_template('gerenciar_sistema.html')

@main_views_bp.route('/lixeira')
@page_access_required('lixeira')
def lixeira_page():
    return render_template('lixeira.html')

@main_views_bp.route('/tv-expedicao')
@page_access_required('tv_expedicao')
def tv_expedicao_page():
    return render_template('tv_expedicao.html', tv_mode=True)

@main_views_bp.route('/registro-compras')
@page_access_required('registro_compras')
def registro_compras_page():
    return render_template('registro_compras.html')

@main_views_bp.route('/pendencias-e-alteracoes')
@page_access_required('pendencias_e_alteracoes')
def pendencias_e_alteracoes_page():
    return render_template('pendencias_e_alteracoes.html')