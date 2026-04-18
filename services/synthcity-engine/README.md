# Synthcity Engine (FastAPI)

## Назначение
Сервис генерации синтетических данных. Работает только с payload от клиента/шлюза и не читает данные из файлов.

- Эндпоинт генерации: `POST /generate`
- Healthcheck: `GET /health`

## Запуск
```bash
cd services/synthcity-engine
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

## Контракт
Сервис принимает:
- `method` — алгоритм synthcity,
- `recordCount` — размер синтетического набора,
- `headers`, `trainData`, `columnMeta` — полностью от клиента.
