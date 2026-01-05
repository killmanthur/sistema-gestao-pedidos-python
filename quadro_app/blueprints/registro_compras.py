# quadro_app/blueprints/registro_compras.py
from flask import Blueprint, request, jsonify
from datetime import datetime
from ..extensions import db, tz_cuiaba
from ..models import RegistroCompra
from quadro_app import socketio  # <-- ADICIONADO

compras_registro_bp = Blueprint('compras_registro', __name__, url_prefix='/api/registro-compras')

def serialize_registro(r):
    return {
        'id': r.id,
        'fornecedor': r.fornecedor,
        'comprador_nome': r.comprador_nome,
        'observacao': r.observacao,
        'status': r.status,
        'data_criacao': r.data_criacao
    }

@compras_registro_bp.route('', methods=['POST'])
def criar_registro():
    try:
        dados = request.get_json()
        comprador = dados.get('comprador_nome') or ""
        status = 'Em Cotação' if comprador.strip() else dados.get('status', 'Aguardando')
        
        novo = RegistroCompra(
            fornecedor=dados.get('fornecedor'),
            comprador_nome=comprador,
            observacao=dados.get('observacao') or "",
            status=status,
            data_criacao=datetime.now(tz_cuiaba).isoformat(),
            editor_nome=dados.get('editor_nome') or "Sistema"
        )
        db.session.add(novo)
        db.session.commit()
        socketio.emit('registro_compras_atualizado')
        return jsonify({'status': 'success', 'id': novo.id}), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@compras_registro_bp.route('', methods=['GET'])
def listar_registros():
    try:
        registros = RegistroCompra.query.order_by(RegistroCompra.data_criacao.desc()).all()
        return jsonify([serialize_registro(r) for r in registros])
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@compras_registro_bp.route('/<int:reg_id>', methods=['PUT'])
def editar_registro(reg_id):
    try:
        dados = request.get_json()
        reg = RegistroCompra.query.get_or_404(reg_id)
        comprador_novo = dados.get('comprador_nome') or ""
        
        if reg.status == 'Aguardando' and comprador_novo.strip():
            reg.status = 'Em Cotação'
        elif dados.get('status'):
            reg.status = dados.get('status')

        reg.fornecedor = dados.get('fornecedor', reg.fornecedor)
        reg.comprador_nome = comprador_novo
        reg.observacao = dados.get('observacao', reg.observacao)
        db.session.commit()
        socketio.emit('registro_compras_atualizado')
        return jsonify({'status': 'success'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@compras_registro_bp.route('/<int:reg_id>', methods=['DELETE'])
def excluir_registro(reg_id):
    try:
        reg = RegistroCompra.query.get_or_404(reg_id)
        db.session.delete(reg)
        db.session.commit()
        socketio.emit('registro_compras_atualizado')
        return jsonify({'status': 'success'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@compras_registro_bp.route('/relatorio', methods=['POST'])
def gerar_relatorio_registro():
    filtros = request.get_json() or {}
    try:
        query = RegistroCompra.query
        if filtros.get('fornecedor'):
            query = query.filter(RegistroCompra.fornecedor.ilike(f"%{filtros['fornecedor']}%"))
        if filtros.get('comprador'):
            query = query.filter(RegistroCompra.comprador_nome == filtros['comprador'])
        if filtros.get('status'):
            query = query.filter(RegistroCompra.status == filtros['status'])
        if filtros.get('dataInicio'):
            query = query.filter(RegistroCompra.data_criacao >= filtros['dataInicio'])
        if filtros.get('dataFim'):
            query = query.filter(RegistroCompra.data_criacao <= filtros['dataFim'] + 'T23:59:59')

        registros = query.all()
        if not registros:
            return jsonify({'relatorio': "Nenhum dado encontrado para os filtros aplicados."})

        stats_compradores = {}
        stats_fornecedores = {}
        total_geral = len(registros)

        for r in registros:
            comp = r.comprador_nome or "EM ABERTO"
            stats_compradores[comp] = stats_compradores.get(comp, 0) + 1
            forn = r.fornecedor
            stats_fornecedores[forn] = stats_fornecedores.get(forn, 0) + 1

        now = datetime.now(tz_cuiaba)
        report = []
        report.append("========================================")
        report.append("      RELATÓRIO DE REGISTRO DE COMPRAS")
        report.append("========================================")
        report.append(f"Gerado em: {now.strftime('%d/%m/%Y %H:%M:%S')}")
        report.append(f"Total de Registros Analisados: {total_geral}")
        
        f_info = []
        if filtros.get('fornecedor'): f_info.append(f"Fornecedor: {filtros['fornecedor']}")
        if filtros.get('comprador'): f_info.append(f"Comprador: {filtros['comprador']}")
        if filtros.get('status'): f_info.append(f"Status: {filtros['status']}")
        if filtros.get('dataInicio'): f_info.append(f"Desde: {filtros['dataInicio']}")
        report.append(f"Filtros: {', '.join(f_info) if f_info else 'Nenhum'}")
        report.append("----------------------------------------\n")

        report.append("PRODUTIVIDADE POR COMPRADOR:")
        for comp in sorted(stats_compradores.keys()):
            qtd = stats_compradores[comp]
            perc = (qtd / total_geral) * 100
            report.append(f"  - {comp.ljust(20)}: {str(qtd).rjust(3)} registros")
        
        report.append("\n----------------------------------------\n")
        report.append("DEMANDA POR FORNECEDOR (Top Demandas):")
        for forn in sorted(stats_fornecedores.keys(), key=lambda x: stats_fornecedores[x], reverse=True):
            qtd = stats_fornecedores[forn]
            report.append(f"  - {forn.ljust(25)}: {qtd} pedido(s)")

        report.append("\n======================================== ")
        report.append("            FIM DO RELATÓRIO")
        report.append("======================================== ")

        return jsonify({'relatorio': '\n'.join(report)})
    except Exception as e:
        return jsonify({'error': str(e)}), 500