# Synthcity Engine (FastAPI)

## Назначение

Сервис генерации синтетических данных. Работает только с payload от клиента/шлюза и не читает данные из файлов.

- Эндпоинт генерации: `POST /generate`
- Healthcheck: `GET /health`

## Установка

```bash
cd services/synthcity-engine
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## Запуск

```bash
cd services/synthcity-engine
.venv\Scripts\Activate.ps1
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

## Контракт

Сервис принимает:

- `method` — алгоритм synthcity,
- `recordCount` — размер синтетического набора,
- `headers`, `trainData`, `columnMeta` — полностью от клиента.
