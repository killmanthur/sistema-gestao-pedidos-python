import json
from quadro_app import create_app, db
from quadro_app.models import Pedido, Sugestao, Separacao, Conferencia, Usuario # Importe todos os seus modelos

def migrate():
    with open('firebase_export.json', 'r', encoding='utf-8') as f:
        data = json.load(f)

    app, _, _ = create_app()
    with app.app_context():
        print("Limpando tabelas existentes...")
        db.drop_all()
        db.create_all()

        print("Iniciando migração...")

        pedido_columns = [c.name for c in Pedido.__table__.columns]

        if 'pedidos' in data and data['pedidos']:
            for fb_id, p_data in data['pedidos'].items():
                # Filtra o dicionário do Firebase, mantendo apenas as chaves
                # que existem como colunas no nosso modelo Pedido
                filtered_data = {key: value for key, value in p_data.items() if key in pedido_columns}
                
                # Cria o objeto Pedido apenas com os dados válidos
                p = Pedido(**filtered_data)
                db.session.add(p)
            print(f"-> {len(data['pedidos'])} Pedidos migrados.")

        if 'sugestoes' in data and data['sugestoes']:
            for fb_id, s_data in data['sugestoes'].items():
                s = Sugestao(**s_data)
                db.session.add(s)
            print(f"-> {len(data['sugestoes'])} Sugestões migradas.")

        if 'separacoes' in data and data['separacoes']:
            for fb_id, s_data in data['separacoes'].items():
                
                # --- INÍCIO DA CORREÇÃO ---
                # Verifica se 'observacoes' existe e é um dicionário
                if 'observacoes' in s_data and isinstance(s_data['observacoes'], dict):
                    # Converte o dicionário de observações em uma lista de seus valores
                    s_data['observacoes'] = list(s_data['observacoes'].values())
                # --- FIM DA CORREÇÃO ---

                s = Separacao(**s_data)
                db.session.add(s)
            print(f"-> {len(data['separacoes'])} Separações migradas.")

        if 'conferencias' in data and data['conferencias']:
         for fb_id, c_data in data['conferencias'].items():
            
            # --- INÍCIO DA CORREÇÃO ---
            # Verifica se 'observacoes' existe e é um dicionário
            if 'observacoes' in c_data and isinstance(c_data['observacoes'], dict):
                # Converte o dicionário de observações em uma lista de seus valores
                c_data['observacoes'] = list(c_data['observacoes'].values())
            
            # Faz o mesmo para 'conferentes', se aplicável
            if 'conferentes' in c_data and isinstance(c_data['conferentes'], dict):
                c_data['conferentes'] = list(c_data['conferentes'].values())
            # --- FIM DA CORREÇÃO ---

            c = Conferencia(**c_data)
            db.session.add(c)
        print(f"-> {len(data['conferencias'])} Conferências migradas.")
        
        if 'usuarios' in data and data['usuarios']:
            for fb_id, u_data in data['usuarios'].items():
                u = Usuario(id=fb_id, **u_data)
                db.session.add(u)
            print(f"-> {len(data['usuarios'])} Usuários migrados.")

        try:
            db.session.commit()
            print("\nMigração concluída com sucesso!")
        except Exception as e:
            db.session.rollback()
            print(f"\nERRO DURANTE A MIGRAÇÃO: {e}")

if __name__ == '__main__':
    migrate()