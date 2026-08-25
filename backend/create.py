from app.db.databases import engine, Base

from app.models.paper import Paper
from app.models.author import Author

Base.metadata.create_all(bind=engine)

print("Database tables created.")