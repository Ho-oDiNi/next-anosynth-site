# API Gateway (FastAPI)

## Назначение

Gateway принимает данные генерации напрямую от клиента и проксирует их в `synthcity-engine`.

- Эндпоинт клиента: `POST /api/generation`
- Healthcheck: `GET /health`

## Установка

```bash
cd services/api-gateway
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## Запуск

```bash
cd services/api-gateway
.venv\Scripts\Activate.ps1
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

## Переменные окружения

- `SYNTHCITY_ENGINE_URL` — URL генератора (по умолчанию: `http://localhost:8001/generate`).
