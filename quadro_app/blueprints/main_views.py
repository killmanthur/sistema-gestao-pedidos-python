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

@main_views_bp.route('/pedidos-a-caminho')
def pedidos_a_caminho_page(): 
    return render_template('pedidos_a_caminho.html')

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

@main_views_bp.route('/historico-sugestoes')
def historico_sugestoes_page(): 
    return render_template('historico_sugestoes.html')

@main_views_bp.route('/dashboard')
def dashboard_page(): 
    return render_template('dashboard.html')

@main_views_bp.route('/dashboard-logistica')
def dashboard_logistica_page():
    return render_template('dashboard_logistica.html')

@main_views_bp.route('/separacoes')
def separacoes_page():
    return render_template('separacoes.html')

@main_views_bp.route('/conferencias')
def conferencias_page():
    return render_template('conferencias.html')

@main_views_bp.route('/dashboard-conferencias')
def dashboard_conferencias_page():
    return render_template('dashboard_conferencias.html')

@main_views_bp.route('/historico-conferencias')
def historico_conferencias_page():
    return render_template('historico_conferencias.html')

@main_views_bp.route('/recebimento')
def recebimento_page():
    return render_template('recebimento.html')

@main_views_bp.route('/gerenciar-separacoes')
def gerenciar_separacoes_page():
    return render_template('gerenciar_separacoes.html')

@main_views_bp.route('/admin/sistema')
def gerenciar_sistema_page():
    return render_template('gerenciar_sistema.html')

@main_views_bp.route('/lixeira')
def lixeira_page():
    return render_template('lixeira.html')

@main_views_bp.route('/tv-expedicao')
def tv_expedicao_page():
    # Passamos tv_mode=True para ativar a classe CSS que esconde o header
    return render_template('tv_expedicao.html', tv_mode=True)

@main_views_bp.route('/registro-compras')
def registro_compras_page():
    return render_template('registro_compras.html')

@main_views_bp.route('/pendencias-e-alteracoes')
def pendencias_e_alteracoes_page():
    return render_template('pendencias_e_alteracoes.html')