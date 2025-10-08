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

def registrar_log(item_id, autor, acao, detalhes=None, log_type='pedidos'):
    """
    Registra um log para qualquer tipo de item (pedidos, separacoes, conferencias).
    """
    try:
        # Mapeia o tipo de log para o caminho correto no DB
        log_paths = {
            'pedidos': f'logs/{item_id}',
            'separacoes': f'logs_separacoes/{item_id}',
            'conferencias': f'logs_conferencias/{item_id}'
        }
        log_path = log_paths.get(log_type, f'logs/{item_id}')

        log_ref = db.reference(log_path)
        
        novo_log = {
            'autor': autor,
            'acao': acao,
            'detalhes': detalhes if detalhes is not None else {},
            'timestamp': datetime.now(tz_cuiaba).isoformat()
        }
        log_ref.push(novo_log)
    except Exception as e:
        print(f"ERRO ao registrar log para {log_type}/{item_id}: {e}")
    
def criar_notificacao_por_role(autor_nome, mensagem, conferencia_id, roles_alvo):
    """
    Envia uma notificação para todos os usuários que pertencem a uma lista de roles.
    """
    try:
        usuarios_ref = db.reference('usuarios')
        todos_usuarios = usuarios_ref.get()
        if not todos_usuarios:
            print("AVISO: Nenhum usuário encontrado para enviar notificações.")
            return

        timestamp = int(time.time() * 1000)
        notificacao_payload = {
            'mensagem': mensagem,
            'conferenciaId': conferencia_id,
            'lida': False,
            'timestamp': timestamp,
            'autor': autor_nome
        }

        uids_notificados = []
        for uid, user_data in todos_usuarios.items():
            # Notifica se a role do usuário está na lista E se ele não é o autor da ação
            if user_data.get('role') in roles_alvo and user_data.get('nome') != autor_nome:
                # Usamos um novo caminho no DB para essas notificações
                notificacao_ref = db.reference(f'notificacoes_pendencias/{uid}')
                notificacao_ref.push(notificacao_payload)
                uids_notificados.append(uid)
        
        if uids_notificados:
            print(f"Notificação de pendência enviada para {len(uids_notificados)} usuários das roles: {roles_alvo}.")

    except Exception as e:
        print(f"ERRO CRÍTICO ao criar notificação por role: {e}")
