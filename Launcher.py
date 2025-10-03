import os
import shutil
import subprocess
import tkinter as tk
from tkinter import messagebox, ttk
from datetime import datetime

# --- CONFIGURAÇÃO ---
# Caminho na rede onde o executável mais recente está.
# ATENÇÃO: Use barras duplas ou raw strings (r'...') para caminhos do Windows.
SERVER_PATH = r"\\192.168.1.249\DevTools_Berti\Tools Dist\sistema-gestao-pedidos-python"

# Nome do seu programa principal.
MAIN_APP_EXE = "QuadroDePedidos.exe"

# Caminho completo para o executável no servidor.
SERVER_APP_PATH = os.path.join(SERVER_PATH, MAIN_APP_EXE)

# Caminho onde o programa será armazenado localmente.
# %APPDATA% é uma pasta segura e oculta no perfil do usuário.
LOCAL_DIR = os.path.join(os.getenv('APPDATA'), "QuadroDePedidos")
LOCAL_APP_PATH = os.path.join(LOCAL_DIR, MAIN_APP_EXE)
# --- FIM DA CONFIGURAÇÃO ---

def show_message(title, message, progress_bar=None):
    """Exibe uma janela de mensagem simples."""
    root = tk.Tk()
    root.withdraw()  # Esconde a janela principal
    if progress_bar:
        # Lógica para centralizar a janela de progresso
        progress_window = tk.Toplevel(root)
        progress_window.title(title)
        progress_window.resizable(False, False)
        
        # CORREÇÃO AQUI: de 'pad_x' para 'padx'
        label = tk.Label(progress_window, text=message, padx=20, pady=10)
        label.pack()
        
        pb = ttk.Progressbar(progress_window, orient='horizontal', length=300, mode='indeterminate')
        pb.pack(padx=20, pady=(0, 20))
        pb.start(10)

        progress_window.update_idletasks()
        width = progress_window.winfo_width()
        height = progress_window.winfo_height()
        x = (progress_window.winfo_screenwidth() // 2) - (width // 2)
        y = (progress_window.winfo_screenheight() // 2) - (height // 2)
        progress_window.geometry(f'{width}x{height}+{x}+{y}')
        
        return progress_window, root
    else:
        messagebox.showerror(title, message)
        root.destroy()
        return None, None

def check_for_updates():
    """Verifica se há uma nova versão no servidor e a copia se necessário."""
    try:
        # Garante que o diretório local exista.
        os.makedirs(LOCAL_DIR, exist_ok=True)

        # 1. Verifica se o arquivo existe no servidor
        if not os.path.exists(SERVER_APP_PATH):
            # Se não houver app no servidor, mas houver localmente, apenas executa o local.
            if os.path.exists(LOCAL_APP_PATH):
                return True, "Servidor offline. Usando versão local."
            else:
                raise FileNotFoundError("Não foi possível encontrar o aplicativo no servidor ou localmente.")

        # 2. Compara as datas de modificação
        needs_update = False
        if not os.path.exists(LOCAL_APP_PATH):
            needs_update = True
        else:
            server_mtime = os.path.getmtime(SERVER_APP_PATH)
            local_mtime = os.path.getmtime(LOCAL_APP_PATH)
            if server_mtime > local_mtime:
                needs_update = True

        # 3. Se precisar atualizar, copia o arquivo
        if needs_update:
            shutil.copy2(SERVER_APP_PATH, LOCAL_APP_PATH)
            return True, "Aplicativo atualizado com sucesso."

        return True, "Aplicativo já está na versão mais recente."

    except Exception as e:
        # Se der erro (rede offline, etc) e já existir uma versão local, tenta usá-la.
        if os.path.exists(LOCAL_APP_PATH):
            return True, f"Erro ao verificar atualizações: {e}. Usando versão local."
        # Se não houver nem versão local, o erro é fatal.
        return False, f"Erro crítico ao obter o aplicativo: {e}"

def main():
    """Função principal do Launcher."""
    progress_window, root = show_message("Quadro de Pedidos", "Verificando atualizações...", progress_bar=True)
    
    success, message = check_for_updates()
    
    if progress_window:
        progress_window.destroy()
    if root:
        root.destroy()

    if success:
        try:
            # Inicia o programa principal e o Launcher se fecha.
            subprocess.Popen([LOCAL_APP_PATH])
        except Exception as e:
            show_message("Erro ao Iniciar", f"Não foi possível iniciar o Quadro de Pedidos.\n\nErro: {e}")
    else:
        # Mostra a mensagem de erro fatal se a atualização falhou e não havia versão local.
        show_message("Erro de Atualização", message)

if __name__ == "__main__":
    main()