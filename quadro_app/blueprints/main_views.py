# quadro_app/blueprints/main_views.py
from flask import Blueprint, render_template, redirect, url_for

main_views_bp = Blueprint('main_views', __name__)

@main_views_bp.route('/')
def index(): 
    return redirect(url_for('main_views.login_page'))

@main_views_bp.route('/login')
def login_page():
    return render_template('login.html')

@main_views_bp.route('/inicio')
def inicio():
    return render_template('inicio.html')

@main_views_bp.route('/quadro')
def quadro(): 
    return render_template('quadro.html')

@main_views_bp.route('/criar-pedido')
def criar_pedido_form(): 
    return render_template('criar_pedido.html')

@main_views_bp.route('/historico')
def historico(): 
    return render_template('historico.html')

@main_views_bp.route('/atualizacao-orcamento')
def atualizacao_orcamento_form(): 
    return render_template('atualizacao_orcamento.html')

@main_views_bp.route('/sugestoes')
def sugestoes_page(): 
    return render_template('sugestoes.html')

@main_views_bp.route('/dashboard')
def dashboard_page(): 
    return render_template('dashboard.html')

@main_views_bp.route('/separacoes')
def separacoes_page():
    return render_template('separacoes.html')

# NOVO: Rota para a nova página
@main_views_bp.route('/gerenciar-separacoes')
def gerenciar_separacoes_page():
    return render_template('gerenciar_separacoes.html')

@main_views_bp.route('/admin/sistema')
def gerenciar_sistema_page():
    return render_template('gerenciar_sistema.html')