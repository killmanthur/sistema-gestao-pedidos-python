# quadro_app/utils.py
from datetime import datetime
from . import db, tz_cuiaba
from .models import Log, Notificacao, Usuario # Importa o modelo de Log do SQLAlchemy

# As funções de notificação do Firebase foram removidas, pois a lógica de notificação
# precisaria ser completamente reimplementada (ex: com WebSockets ou polling).

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
        print(f"ERRO ao registrar log local para {log_type}/{item_id}: {e}")
        db.session.rollback()

def criar_notificacao(user_id, mensagem, link=None):
    """
    Cria e salva uma nova notificação no banco de dados local.
    """
    try:
        # Verifica se o usuário existe
        usuario = Usuario.query.get(user_id)
        if not usuario:
            print(f"AVISO: Tentativa de notificar usuário inexistente: {user_id}")
            return

        nova_notificacao = Notificacao(
            user_id=user_id,
            mensagem=mensagem,
            link=link,
            lida=False,
            timestamp=datetime.now(tz_cuiaba).isoformat()
        )
        db.session.add(nova_notificacao)
        db.session.commit()
    except Exception as e:
        print(f"ERRO ao criar notificação local para user_id {user_id}: {e}")
        db.session.rollback()
