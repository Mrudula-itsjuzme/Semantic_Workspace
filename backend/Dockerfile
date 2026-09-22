FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# Run migrations then start API (worker image reuses this and overrides CMD)
CMD ["sh", "-c", "alembic upgrade head || python create.py; uvicorn app.main:app --host 0.0.0.0 --port 8000"]
