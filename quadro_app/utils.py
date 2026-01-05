# quadro_app/utils.py
from datetime import datetime
from .extensions import db
from .extensions import tz_cuiaba
from .models import Log, Notificacao, Usuario 
from quadro_app import socketio  # <-- ADICIONADO

# As funções de notificação do Firebase foram removidas, pois a lógica de notificação
# precisaria ser completamente reimplementada (ex: com WebSockets ou polling).

def criar_notificacao(user_id, mensagem, link=None):
    try:
        # 1. Salva no Banco de Dados
        nova_notificacao = Notificacao(
            user_id=user_id,
            mensagem=mensagem,
            link=link,
            lida=False,
            timestamp=datetime.now(tz_cuiaba).isoformat()
        )
        db.session.add(nova_notificacao)
        db.session.commit()

        # 2. DISPARA O EVENTO IMEDIATO
        # Importante: room=user_id deve ser o UID do Firebase/Banco
        from quadro_app import socketio
        socketio.emit('nova_notificacao', {
            'mensagem': mensagem,
            'link': link
        }, room=user_id) # O segredo está aqui!
        
        print(f"Socket: Notificação enviada para a sala {user_id}")

    except Exception as e:
        print(f"Erro ao criar notificação: {e}")

def registrar_log(item_id, autor, acao, detalhes=None, log_type='pedidos'):
    """
    Registra um log no banco de dados local (SQLite).
    """
    try:
        novo_log = Log(
            item_id=str(item_id),
            log_type=log_type,
            autor=autor,
            acao=acao,
            detalhes=detalhes if detalhes is not None else {},
            timestamp=datetime.now(tz_cuiaba).isoformat()
        )
        db.session.add(novo_log)
        db.session.commit()
    except Exception as e:
        db.session.rollback()