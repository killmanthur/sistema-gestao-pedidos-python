# quadro_app/utils.py
import time
from datetime import datetime
from . import db, tz_cuiaba

def criar_notificacao_edicao(pedido_id, editor_nome):
    try:
        pedido_ref = db.reference(f'pedidos/{pedido_id}')
        pedido = pedido_ref.get()
        if not pedido: return

        vendedor_nome = pedido.get('vendedor')
        comprador_nome = pedido.get('comprador')
        
        destinatario_nome = None
        if editor_nome == vendedor_nome and comprador_nome:
            destinatario_nome = comprador_nome
        elif editor_nome == comprador_nome and vendedor_nome:
            destinatario_nome = vendedor_nome
        
        if not destinatario_nome: return

        usuarios_ref = db.reference('usuarios')
        todos_usuarios = usuarios_ref.order_by_child('nome').equal_to(destinatario_nome).get()
        
        if todos_usuarios:
            destinatario_uid = list(todos_usuarios.keys())[0]
            notificacao_ref = db.reference(f'notificacoes/{destinatario_uid}')
            
            codigo_pedido = pedido.get('itens', [{}])[0].get('codigo', pedido.get('codigo', 'N/A'))
            if len(pedido.get('itens', [])) > 1:
                codigo_pedido += "..."

            notificacao_ref.push({
                'mensagem': f"{editor_nome} editou o pedido '{codigo_pedido}'",
                'pedidoId': pedido_id,
                'lida': False,
                'timestamp': int(time.time() * 1000)
            })
    except Exception as e:
        print(f"ERRO ao criar notificação de edição: {e}")

# MUDANÇA: Função 'registrar_log' unificada
def registrar_log(item_id, autor, acao, detalhes=None, log_type='pedidos'):
    """
    Registra um log para qualquer tipo de item (pedidos, separacoes, etc.).
    Agora aceita um dicionário 'detalhes' para consistência.
    """
    try:
        # Define o caminho correto com base no tipo de log
        log_path = f'logs_separacoes/{item_id}' if log_type == 'separacoes' else f'logs/{item_id}'
        log_ref = db.reference(log_path)
        
        novo_log = {
            'autor': autor,
            'acao': acao,
            'detalhes': detalhes if detalhes is not None else {}, # Garante que 'detalhes' seja sempre um dict
            'timestamp': datetime.now(tz_cuiaba).isoformat()
        }
        log_ref.push(novo_log)
    except Exception as e:
        print(f"ERRO ao registrar log para {log_type}/{item_id}: {e}")