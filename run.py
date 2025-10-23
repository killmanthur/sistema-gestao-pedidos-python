# run.py (versão FINAL para servidor de rede interna)
from waitress import serve
from quadro_app import create_app

if __name__ == '__main__':
    # Define a porta em que a aplicação vai rodar.
    PORT = 52080
    
    # Cria a aplicação Flask
    app, _, _ = create_app()

    print(f"--- Servidor do Quadro de Pedidos ---")
    print(f"Iniciando na porta: {PORT}")
    print(f"Servidor pronto. Os usuários podem acessar em http://<IP_DO_SERVIDOR>:{PORT}")
    print("Este console mostrará os logs de acesso. Para parar o servidor, pressione Ctrl+C.")
    
    # Inicia o servidor Waitress. 
    # host='0.0.0.0' é CRUCIAL. Significa "aceite conexões de qualquer IP na rede".
    serve(app, host='0.0.0.0', port=PORT, threads=8)