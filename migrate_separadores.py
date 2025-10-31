
import os
import sqlite3
import json
import shutil
from contextlib import closing

# Importe o create_app e o db do seu projeto
from quadro_app import create_app
from quadro_app.models import Separacao, db # Importe o db também

print("--- INICIANDO SCRIPT DE MIGRAÇÃO DA TABELA 'SEPARACAO' ---")

# 1. SETUP DA APLICAÇÃO E CAMINHOS
project_root = os.path.abspath(os.path.dirname(__file__))
db_filename = 'quadro_local.db'
db_path = os.path.join(project_root, db_filename)
backup_path = os.path.join(project_root, f'{db_filename}.backup.{os.path.getmtime(db_path)}')

# 2. BACKUP
try:
    print(f"\n[PASSO 1/7] Criando backup do banco de dados em '{backup_path}'...")
    if not os.path.exists(db_path):
        print(f"ERRO: Banco de dados '{db_filename}' não encontrado. Abortando.")
        exit(1)
    shutil.copyfile(db_path, backup_path)
    print(">>> Backup criado com sucesso.")
except Exception as e:
    print(f"ERRO CRÍTICO ao criar o backup: {e}\n!!! MIGRAÇÃO ABORTADA !!!")
    exit(1)

# 3. VERIFICAÇÃO E MIGRAÇÃO
app, _, _ = create_app()

with app.app_context():
    try:
        with closing(sqlite3.connect(db_path)) as connection:
            with closing(connection.cursor()) as cursor:
                print("\n[PASSO 2/7] Verificando estrutura atual da tabela 'separacao'...")
                cursor.execute("PRAGMA table_info(separacao);")
                columns = [info[1] for info in cursor.fetchall()]
                if 'separadores_nomes' in columns:
                    print(">>> A coluna 'separadores_nomes' já existe. Migração não é necessária.")
                    exit(0)
                if 'separador_nome' not in columns:
                    print("ERRO: Coluna 'separador_nome' não encontrada.\n!!! MIGRAÇÃO ABORTADA !!!")
                    exit(1)

                print(">>> Estrutura antiga detectada. Iniciando a migração...")

                # PASSO 3: Renomear tabela antiga
                print("\n[PASSO 3/7] Renomeando tabela 'separacao' para 'separacao_old'...")
                cursor.execute("ALTER TABLE separacao RENAME TO separacao_old;")
                print(">>> Tabela antiga renomeada.")

                # PASSO 4: Criar nova tabela com o esquema correto
                print("\n[PASSO 4/7] Criando nova tabela 'separacao' com a estrutura do modelo...")
                # Usamos o SQLAlchemy para gerar o comando SQL CREATE TABLE correto
                create_table_sql = str(Separacao.__table__.create(bind=db.engine, checkfirst=False))
                cursor.execute(create_table_sql)
                print(">>> Nova tabela criada com sucesso.")
                
                # PASSO 5: Ler todos os dados da tabela antiga
                print("\n[PASSO 5/7] Lendo dados da tabela antiga...")
                cursor.execute("SELECT * FROM separacao_old;")
                old_rows = cursor.fetchall()
                old_columns = [description[0] for description in cursor.description]
                total_rows = len(old_rows)
                print(f"    - {total_rows} registros encontrados.")
                
                # PASSO 6: Transformar e inserir os dados na nova tabela
                print("\n[PASSO 6/7] Transformando e inserindo dados na nova tabela...")
                
                # Monta a query de INSERT com placeholders
                new_columns = [c.name for c in Separacao.__table__.columns]
                placeholders = ', '.join(['?'] * len(new_columns))
                insert_sql = f"INSERT INTO separacao ({', '.join(new_columns)}) VALUES ({placeholders})"
                
                transformed_data = []
                for row in old_rows:
                    row_data = dict(zip(old_columns, row))
                    
                    # Transformação do separador_nome
                    old_name = row_data.get('separador_nome')
                    new_names_list = [old_name] if old_name and old_name.strip() else []
                    
                    # Transformação das observações
                    observacoes_str = row_data.get('observacoes')
                    if observacoes_str and isinstance(observacoes_str, str):
                        try:
                            observacoes_obj = json.loads(observacoes_str)
                        except json.JSONDecodeError:
                            observacoes_obj = None # Define como nulo se for inválido
                    else:
                        observacoes_obj = observacoes_str # Mantém o valor original se não for string

                    # Prepara a tupla na ordem correta das colunas da nova tabela
                    new_row_tuple = []
                    for col_name in new_columns:
                        if col_name == 'separadores_nomes':
                            new_row_tuple.append(json.dumps(new_names_list)) # Serializa para string JSON
                        elif col_name == 'observacoes':
                            new_row_tuple.append(json.dumps(observacoes_obj)) # Serializa para string JSON
                        else:
                            new_row_tuple.append(row_data.get(col_name))
                    
                    transformed_data.append(tuple(new_row_tuple))

                # Executa a inserção de todos os dados de uma vez (muito mais rápido)
                cursor.executemany(insert_sql, transformed_data)
                print(f">>> {cursor.rowcount} registros inseridos com sucesso.")

                # PASSO 7: Remover a tabela antiga
                print("\n[PASSO 7/7] Removendo tabela de backup 'separacao_old'...")
                cursor.execute("DROP TABLE separacao_old;")
                print(">>> Tabela de backup removida.")
                
                # Confirma todas as operações
                connection.commit()
                print("\n\n*** MIGRAÇÃO CONCLUÍDA COM SUCESSO! ***")
    
    except Exception as e:
        print(f"\n!!! ERRO DURANTE A MIGRAÇÃO: {e} !!!")
        # Tentativa de reverter as alterações no banco de dados
        try:
            with closing(sqlite3.connect(db_path)) as conn:
                conn.rollback()
                print("    - A operação foi revertida (rollback). Seu banco de dados pode estar em um estado inconsistente.")
                print("    - RECOMENDAÇÃO: Restaure a partir do arquivo de backup criado.")
        except:
            print("    - Não foi possível reverter a operação. Restaure o backup manualmente.")
        exit(1)

print("--- SCRIPT FINALIZADO ---")