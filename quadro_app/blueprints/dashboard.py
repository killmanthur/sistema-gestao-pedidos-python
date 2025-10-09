# quadro_app/blueprints/dashboard.py
from flask import Blueprint, request, jsonify, Response
from datetime import datetime
from quadro_app import db, tz_cuiaba

dashboard_bp = Blueprint('dashboard', __name__, url_prefix='/api')

@dashboard_bp.route('/historico-paginado', methods=['POST'])
def get_historico_paginado():
    try:
        filtros = request.get_json() or {}
        page = filtros.get('page', 0)
        limit = filtros.get('limit', 20)
        offset = page * limit

        todos_pedidos_ref = db.reference('pedidos').order_by_child('status').equal_to('OK')
        todos_pedidos_snapshot = todos_pedidos_ref.get()

        if not todos_pedidos_snapshot:
            return jsonify({'pedidos': [], 'temMais': False})

        pedidos_com_id = [{'id': key, **value} for key, value in todos_pedidos_snapshot.items()]

        # --- FILTRAGEM NO SERVIDOR ---
        vendedor_f = filtros.get('vendedor', '').lower().strip()
        comprador_f = filtros.get('comprador', '').lower().strip()
        codigo_f = filtros.get('codigo', '').lower().strip()
        data_inicio_f = filtros.get('dataInicio')
        data_fim_f = filtros.get('dataFim')

        pedidos_filtrados = []
        if not any([vendedor_f, comprador_f, codigo_f, data_inicio_f, data_fim_f]):
            pedidos_filtrados = pedidos_com_id
        else:
            for p in pedidos_com_id:
                data_finalizacao = p.get('data_finalizacao', '').split('T')[0]
                if data_inicio_f and (not data_finalizacao or data_finalizacao < data_inicio_f): continue
                if data_fim_f and (not data_finalizacao or data_finalizacao > data_fim_f): continue
                
                if vendedor_f and vendedor_f not in p.get('vendedor', '').lower(): continue
                if comprador_f and comprador_f not in p.get('comprador', '').lower(): continue
                if codigo_f:
                    termo = codigo_f
                    codigo_pedido = p.get('código', p.get('codigo', '')).lower()
                    tem_no_item = any(termo in item.get('codigo', '').lower() for item in p.get('itens', []))
                    if termo not in codigo_pedido and not tem_no_item:
                        continue
                
                pedidos_filtrados.append(p)
        
        pedidos_ordenados = sorted(pedidos_filtrados, key=lambda x: x.get('data_finalizacao', ''), reverse=True)
        itens_da_pagina = pedidos_ordenados[offset : offset + limit]
        tem_mais = (offset + limit) < len(pedidos_ordenados)

        return jsonify({'pedidos': itens_da_pagina, 'temMais': tem_mais})

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
        todos_pedidos = db.reference('pedidos').get() or {}
        todas_sugestoes = db.reference('sugestoes').get() or {}

        line_chart_data = {}
        vendedor_counts = {}
        comprador_counts = {}

        # --- Processar Pedidos ---
        for pid, p in todos_pedidos.items():
            data_pedido = p.get('data_criacao', '').split('T')[0]
            if data_inicio and data_pedido < data_inicio: continue
            if data_fim and data_pedido > data_fim: continue
            
            vendedor = p.get('vendedor', '')
            comprador = p.get('comprador', '')
            if vendedor_filtro and vendedor_filtro not in vendedor.lower(): continue
            if comprador_filtro and comprador_filtro not in comprador.lower(): continue

            if vendedor:
                vendedor_counts[vendedor] = vendedor_counts.get(vendedor, 0) + 1
            if comprador:
                comprador_counts[comprador] = comprador_counts.get(comprador, 0) + 1
            
            mes_ano = datetime.fromisoformat(p.get('data_criacao')).strftime('%Y-%m')
            if mes_ano not in line_chart_data:
                line_chart_data[mes_ano] = {'pedidos_rua': 0, 'orcamentos': 0, 'sugestoes': 0}
            
            if p.get('tipo_req') == 'Pedido Produto':
                line_chart_data[mes_ano]['pedidos_rua'] += 1
            elif p.get('tipo_req') == 'Atualização Orçamento':
                line_chart_data[mes_ano]['orcamentos'] += 1

        # --- Processar Sugestões ---
        for sid, s in todas_sugestoes.items():
            data_sugestao = s.get('data_criacao', '').split('T')[0]
            if data_inicio and data_sugestao < data_inicio: continue
            if data_fim and data_sugestao > data_fim: continue
            
            vendedor = s.get('vendedor', '')
            if vendedor_filtro and vendedor_filtro not in vendedor.lower(): continue

            mes_ano = datetime.fromisoformat(s.get('data_criacao')).strftime('%Y-%m')
            if mes_ano not in line_chart_data:
                line_chart_data[mes_ano] = {'pedidos_rua': 0, 'orcamentos': 0, 'sugestoes': 0}
            line_chart_data[mes_ano]['sugestoes'] += 1

        # --- Formatar dados para o Chart.js ---
        sorted_months = sorted(line_chart_data.keys())
        line_labels = sorted_months
        pedidos_rua_values = [line_chart_data[m]['pedidos_rua'] for m in sorted_months]
        orcamentos_values = [line_chart_data[m]['orcamentos'] for m in sorted_months]
        sugestoes_values = [line_chart_data[m]['sugestoes'] for m in sorted_months]
        
        vendedor_labels = list(vendedor_counts.keys())
        vendedor_values = list(vendedor_counts.values())
        comprador_labels = list(comprador_counts.keys())
        comprador_values = list(comprador_counts.values())

        return jsonify({
            'lineChart': {
                'labels': line_labels,
                'datasets': [
                    {'label': 'Pedidos de Rua', 'data': pedidos_rua_values, 'borderColor': '#3B71CA', 'fill': False, 'tension': 0.1},
                    {'label': 'Orçamentos', 'data': orcamentos_values, 'borderColor': '#5cb85c', 'fill': False, 'tension': 0.1},
                    {'label': 'Sugestões', 'data': sugestoes_values, 'borderColor': '#f0ad4e', 'fill': False, 'tension': 0.1}
                ]
            },
            'pieChartVendedores': {'labels': vendedor_labels, 'data': vendedor_values},
            'pieChartCompradores': {'labels': comprador_labels, 'data': comprador_values}
        }), 200

    except Exception as e:
        print(f"ERRO ao gerar dados do dashboard: {e}")
        return jsonify({'error': str(e)}), 500

@dashboard_bp.route('/relatorio', methods=['POST'])
def gerar_relatorio_endpoint():
    filtros = request.get_json() or {}
    
    try:
        query = db.reference('pedidos').order_by_child('data_finalizacao')
        if filtros.get('dataInicio'):
            query = query.start_at(filtros['dataInicio'])
        if filtros.get('dataFim'):
            query = query.end_at(filtros['dataFim'] + '\uf8ff')
            
        todos_pedidos_do_periodo = query.get() or {}
        
        pedidos_filtrados = []
        for pid, p in todos_pedidos_do_periodo.items():
            if p.get('status') != 'OK':
                continue
            if filtros.get('vendedor') and filtros['vendedor'].lower() not in p.get('vendedor', '').lower():
                continue
            if filtros.get('comprador') and filtros['comprador'].lower() not in p.get('comprador', '').lower():
                continue
            if filtros.get('codigo'):
                termo = filtros['codigo'].lower()
                codigo_pedido = p.get('código', p.get('codigo', '')).lower()
                tem_no_item = any(termo in item.get('codigo', '').lower() for item in p.get('itens', []))
                if termo not in codigo_pedido and not tem_no_item:
                    continue
            pedidos_filtrados.append(p)

        if not pedidos_filtrados:
            return jsonify({'relatorio': "Nenhum dado encontrado para o relatório com os filtros aplicados."})

        stats = {
            'totalPedidos': len(pedidos_filtrados),
            'porVendedor': {},
            'porComprador': {}
        }
        for pedido in pedidos_filtrados:
            vendedor, comprador, tipo_req = pedido.get('vendedor'), pedido.get('comprador'), pedido.get('tipo_req')
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
    # Recebe o texto do relatório que o frontend gerou
    report_content = request.data.decode('utf-8')
    
    # Cria um nome de arquivo com a data atual
    filename = f"relatorio_pedidos_{datetime.now(tz_cuiaba).strftime('%Y-%m-%d')}.txt"
    
    # Retorna o conteúdo como um arquivo para download
    return Response(
        report_content,
        mimetype="text/plain",
        headers={"Content-disposition": f"attachment; filename={filename}"}
    )