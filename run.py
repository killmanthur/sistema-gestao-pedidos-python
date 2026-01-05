# run.py

from quadro_app import create_app

# create_app() agora retorna o app, a instância do socketio e o modo TV
app, socketio, TV_MODE = create_app()

if __name__ == '__main__':
    # PORTA padrão 5000
    PORT = 52080
    
    print(f"\nIniciando servidor em http://localhost:{PORT}")
    print(f"Modo TV: {'Ativado' if TV_MODE else 'Desativado'}\n")

    # Corrigido: Removido o argumento 'threads=8' que causava o erro.
    # debug=True permite que o servidor reinicie sozinho ao salvar arquivos.
    # allow_unsafe_werkzeug=True é necessário em versões recentes para rodar com SocketIO localmente.
    socketio.run(app, 
                 host='0.0.0.0', 
                 port=PORT, 
                 debug=False, 
                 allow_unsafe_werkzeug=True)