# run.py (versão para servidor)
from waitress import serve
from quadro_app import create_app

if __name__ == '__main__':
    # Define a porta em que a aplicação vai rodar. 8080 é um padrão comum.
    PORT = 52080

    
    # Cria a aplicação Flask
    app, _, _ = create_app() # Não precisamos mais da API do webview

    print(f"--- Servidor do Quadro de Pedidos ---")
    print(f"Iniciando na porta: {PORT}")
    print(f"Para acessar, use http://<IP_DO_SERVIDOR>:{PORT} em um navegador.")
    print("Pressione Ctrl+C para parar o servidor.")
    
    # Inicia o servidor Waitress
    # host='0.0.0.0' é CRUCIAL. Significa "aceite conexões de qualquer IP na rede".
    # Se você usar '127.0.0.1', só funcionará no próprio servidor.
    serve(app, host='0.0.0.0', port=PORT)