# run.py
import threading
import socket
import webview
from waitress import serve
from quadro_app import create_app

def find_free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(('', 0))
        return s.getsockname()[1]

def run_server(app, port):
    serve(app, host='127.0.0.1', port=port)

if __name__ == '__main__':
    PORT = find_free_port()
    
    app, api, TV_MODE = create_app()

    server_thread = threading.Thread(target=run_server, args=(app, PORT,))
    server_thread.daemon = True
    server_thread.start()
    
    window = webview.create_window(
        'Quadro de Pedidos',
        f'http://127.0.0.1:{PORT}',
        width=1280,
        height=800,
        resizable=True,
        min_size=(800, 600),
        js_api=api,
        fullscreen=TV_MODE,
        maximized=not TV_MODE
    )
    
    api.set_window(window)
    
    # MUDANÇA: Voltamos ao webview.start() original, sem o argumento 'gui'
    webview.start(debug=True)  # Remova 'gui' para usar o padrão do sistema operacional 