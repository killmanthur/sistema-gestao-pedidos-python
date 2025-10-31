# quadro_app/extensions.py
from flask_sqlalchemy import SQLAlchemy
from datetime import timezone, timedelta

db = SQLAlchemy()
tz_cuiaba = timezone(timedelta(hours=-4))