# quadro_app/blueprints/dashboard.py
from flask import Blueprint, request, jsonify, Response
from datetime import datetime
from sqlalchemy import or_
from ..extensions import db, tz_cuiaba
from quadro_app.models import Pedido, Sugestao

dashboard_bp = Blueprint('dashboard', __name__, url_prefix='/api')

def serialize_pedido(p):
    """Converte um objeto Pedido do SQLAlchemy em um dicionário."""
    return {
        'id': p.id, 'vendedor': p.vendedor, 'status': p.status,
        'tipo_req': p.tipo_req, 'comprador': p.comprador,
        'data_criacao': p.data_criacao, 'data_finalizacao': p.data_finalizacao,
        'observacao_geral': p.observacao_geral, 'itens': p.itens,
        'codigo': p.codigo, 'descricao': p.descricao
    }

@dashboard_bp.route('/historico-paginado', methods=['POST'])
def get_historico_paginado():
    try:
        filtros = request.get_json() or {}
        page = filtros.get('page', 0)
        limit = filtros.get('limit', 20)

        query = Pedido.query.filter_by(status='OK')

        if filtros.get('vendedor'):
            query = query.filter(Pedido.vendedor.ilike(f"%{filtros['vendedor']}%"))
        if filtros.get('comprador'):
            query = query.filter(Pedido.comprador.ilike(f"%{filtros['comprador']}%"))
        if filtros.get('dataInicio'):
            query = query.filter(Pedido.data_finalizacao >= filtros['dataInicio'])
        if filtros.get('dataFim'):
            query = query.filter(Pedido.data_finalizacao <= filtros['dataFim'] + 'T23:59:59')
        if filtros.get('codigo'):
            termo_codigo = f"%{filtros['codigo']}%"
            query = query.filter(or_(
                Pedido.codigo.ilike(termo_codigo),
                Pedido.itens.cast(db.String).ilike(termo_codigo)
            ))

        pagination = query.order_by(Pedido.data_finalizacao.desc()).paginate(page=page + 1, per_page=limit, error_out=False)

        pedidos_da_pagina = pagination.items
        tem_mais = pagination.has_next

        return jsonify({
            'pedidos': [serialize_pedido(p) for p in pedidos_da_pagina],
            'temMais': tem_mais
        })
    except Exception as e:
        print(f"ERRO ao buscar histórico paginado: {e}")
        return jsonify({'error': str(e)}), 500

@dashboard_bp.route('/dashboard-data', methods=['POST'])
def get_dashboard_data():
    filtros = request.get_json() or {}
    data_inicio = filtros.get('dataInicio')
    data_fim = filtros.get('dataFim')
    vendedor_filtro = filtros.get('vendedor', '').lower()
    comprador_filtro = filtros.get('comprador', '').lower()

    try:
        # Busca inicial de dados
        pedidos_query = Pedido.query
        sugestoes_query = Sugestao.query

        # Aplica filtros de data
        if data_inicio:
            pedidos_query = pedidos_query.filter(Pedido.data_criacao >= data_inicio)
            sugestoes_query = sugestoes_query.filter(Sugestao.data_criacao >= data_inicio)
        if data_fim:
            pedidos_query = pedidos_query.filter(Pedido.data_criacao <= data_fim + 'T23:59:59')
            sugestoes_query = sugestoes_query.filter(Sugestao.data_criacao <= data_fim + 'T23:59:59')
        
        # Aplica filtros de texto
        if vendedor_filtro:
            pedidos_query = pedidos_query.filter(Pedido.vendedor.ilike(f'%{vendedor_filtro}%'))
            sugestoes_query = sugestoes_query.filter(Sugestao.vendedor.ilike(f'%{vendedor_filtro}%'))
        if comprador_filtro:
            pedidos_query = pedidos_query.filter(Pedido.comprador.ilike(f'%{comprador_filtro}%'))
            # Sugestões também podem ter comprador
            sugestoes_query = sugestoes_query.filter(Sugestao.comprador.ilike(f'%{comprador_filtro}%'))

        todos_pedidos = pedidos_query.all()
        todas_sugestoes = sugestoes_query.all()

        line_chart_data = {}
        vendedor_counts = {}
        comprador_counts = {}

        # Processa Pedidos
        for p in todos_pedidos:
            vendedor = p.vendedor or ''
            comprador = p.comprador or ''
            
            if vendedor:
                vendedor_counts[vendedor] = vendedor_counts.get(vendedor, 0) + 1
            if comprador:
                comprador_counts[comprador] = comprador_counts.get(comprador, 0) + 1
            
            try:
                mes_ano = datetime.fromisoformat(p.data_criacao).strftime('%Y-%m')
                if mes_ano not in line_chart_data:
                    line_chart_data[mes_ano] = {'pedidos_rua': 0, 'orcamentos': 0, 'sugestoes': 0}
                
                if p.tipo_req == 'Pedido Produto':
                    line_chart_data[mes_ano]['pedidos_rua'] += 1
                elif p.tipo_req == 'Atualização Orçamento':
                    line_chart_data[mes_ano]['orcamentos'] += 1
            except (ValueError, TypeError):
                continue # Ignora datas mal formatadas

        # Processa Sugestões
        for s in todas_sugestoes:
            try:
                mes_ano = datetime.fromisoformat(s.data_criacao).strftime('%Y-%m')
                if mes_ano not in line_chart_data:
                    line_chart_data[mes_ano] = {'pedidos_rua': 0, 'orcamentos': 0, 'sugestoes': 0}
                line_chart_data[mes_ano]['sugestoes'] += 1
            except (ValueError, TypeError):
                continue

        # Formata dados para Chart.js
        sorted_months = sorted(line_chart_data.keys())
        
        return jsonify({
            'lineChart': {
                'labels': sorted_months,
                'datasets': [
                    {'label': 'Pedidos de Rua', 'data': [line_chart_data[m]['pedidos_rua'] for m in sorted_months], 'borderColor': '#3B71CA', 'fill': False, 'tension': 0.1},
                    {'label': 'Orçamentos', 'data': [line_chart_data[m]['orcamentos'] for m in sorted_months], 'borderColor': '#5cb85c', 'fill': False, 'tension': 0.1},
                    {'label': 'Sugestões', 'data': [line_chart_data[m]['sugestoes'] for m in sorted_months], 'borderColor': '#f0ad4e', 'fill': False, 'tension': 0.1}
                ]
            },
            'pieChartVendedores': {'labels': list(vendedor_counts.keys()), 'data': list(vendedor_counts.values())},
            'pieChartCompradores': {'labels': list(comprador_counts.keys()), 'data': list(comprador_counts.values())}
        }), 200

    except Exception as e:
        print(f"ERRO ao gerar dados do dashboard: {e}")
        return jsonify({'error': str(e)}), 500

@dashboard_bp.route('/relatorio', methods=['POST'])
def gerar_relatorio_endpoint():
    filtros = request.get_json() or {}
    
    try:
        query = Pedido.query.filter_by(status='OK')

        if filtros.get('vendedor'):
            query = query.filter(Pedido.vendedor.ilike(f"%{filtros['vendedor']}%"))
        if filtros.get('comprador'):
            query = query.filter(Pedido.comprador.ilike(f"%{filtros['comprador']}%"))
        if filtros.get('dataInicio'):
            query = query.filter(Pedido.data_finalizacao >= filtros['dataInicio'])
        if filtros.get('dataFim'):
            query = query.filter(Pedido.data_finalizacao <= filtros['dataFim'] + 'T23:59:59')
        if filtros.get('codigo'):
            termo_codigo = f"%{filtros['codigo']}%"
            query = query.filter(or_(
                Pedido.codigo.ilike(termo_codigo),
                Pedido.itens.cast(db.String).ilike(termo_codigo)
            ))

        pedidos_filtrados = query.all()

        if not pedidos_filtrados:
            return jsonify({'relatorio': "Nenhum dado encontrado para o relatório com os filtros aplicados."})

        stats = {
            'totalPedidos': len(pedidos_filtrados),
            'porVendedor': {},
            'porComprador': {}
        }
        for pedido in pedidos_filtrados:
            vendedor, comprador, tipo_req = pedido.vendedor, pedido.comprador, pedido.tipo_req
            if vendedor:
                stats['porVendedor'].setdefault(vendedor, {'total': 0, 'pedidosRua': 0, 'orcamentos': 0})
                stats['porVendedor'][vendedor]['total'] += 1
                if tipo_req == 'Atualização Orçamento': stats['porVendedor'][vendedor]['orcamentos'] += 1
                else: stats['porVendedor'][vendedor]['pedidosRua'] += 1
            if comprador:
                stats['porComprador'].setdefault(comprador, {'total': 0, 'pedidosRua': 0, 'orcamentos': 0})
                stats['porComprador'][comprador]['total'] += 1
                if tipo_req == 'Atualização Orçamento': stats['porComprador'][comprador]['orcamentos'] += 1
                else: stats['porComprador'][comprador]['pedidosRua'] += 1

        report_lines = []
        now = datetime.now(tz_cuiaba)
        header = f"""
========================================
  RELATÓRIO DE PEDIDOS FINALIZADOS
========================================
Gerado em: {now.strftime('%d/%m/%Y %H:%M:%S')}
Total de Pedidos Analisados: {stats['totalPedidos']}
----------------------------------------
"""
        report_lines.append(header.strip())
        report_lines.append("\nREQUISIÇÕES POR VENDEDOR:")
        vendedores = sorted(stats['porVendedor'].keys())
        if not vendedores:
            report_lines.append("  - Nenhum vendedor encontrado.")
        else:
            for vendedor in vendedores:
                data = stats['porVendedor'][vendedor]
                report_lines.append(f"  - {vendedor} ({data['total']} total):")
                report_lines.append(f"    - {data['pedidosRua']} Pedido(s) de Rua")
                report_lines.append(f"    - {data['orcamentos']} Atualização(ões) de Orçamento")
        
        report_lines.append("\n----------------------------------------\n")
        report_lines.append("ATENDIMENTOS POR COMPRADOR:")
        compradores = sorted(stats['porComprador'].keys())
        if not compradores:
            report_lines.append("  - Nenhum comprador encontrado.")
        else:
            for comprador in compradores:
                data = stats['porComprador'][comprador]
                report_lines.append(f"  - {comprador} ({data['total']} total):")
                report_lines.append(f"    - {data['pedidosRua']} Pedido(s) de Rua")
                report_lines.append(f"    - {data['orcamentos']} Atualização(ões) de Orçamento")
        report_lines.append("\n========================================")

        return jsonify({'relatorio': '\n'.join(report_lines)})

    except Exception as e:
        return jsonify({'error': f"Erro ao gerar relatório: {e}"}), 500

@dashboard_bp.route('/download-relatorio', methods=['POST'])
def download_relatorio():
    report_content = request.data.decode('utf-8')
    filename = f"relatorio_pedidos_{datetime.now(tz_cuiaba).strftime('%Y-%m-%d')}.txt"
    return Response(
        report_content,
        mimetype="text/plain",
        headers={"Content-disposition": f"attachment; filename={filename}"}
    )

@dashboard_bp.route('/sugestoes-paginadas', methods=['GET'])
def get_sugestoes_paginadas():
    status = request.args.get('status', 'pendente')
    limit = int(request.args.get('limit', 10))
    page = int(request.args.get('page', 0))
    search_term = request.args.get('search', '').lower().strip()
    
    query = Sugestao.query.filter_by(status=status)

    if search_term:
        search_filter = or_(
            Sugestao.vendedor.ilike(f'%{search_term}%'),
            Sugestao.comprador.ilike(f'%{search_term}%'),
            Sugestao.itens.cast(db.String).ilike(f'%{search_term}%')
        )
        query = query.filter(search_filter)

    pagination = query.order_by(Sugestao.data_criacao.desc()).paginate(page=page + 1, per_page=limit, error_out=False)
    
    # Precisamos da função serialize_sugestao aqui também
    def serialize_sugestao_local(s):
        return {
            'id': s.id, 'vendedor': s.vendedor, 'status': s.status,
            'comprador': s.comprador, 'data_criacao': s.data_criacao,
            'itens': s.itens, 'observacao_geral': s.observacao_geral
        }

    sugestoes = pagination.items
    tem_mais = pagination.has_next
    
    return jsonify({
        'sugestoes': [serialize_sugestao_local(s) for s in sugestoes],
        'temMais': tem_mais
    })