## Обязательно создать отдельный .venv для избежания конфликта библиотек

cd ./services/synthcity-engine
python -m venv .venv

# Windows PowerShell

.venv\Scripts\Activate.ps1

# Linux / macOS

source .venv/bin/activate

pip install -r .\requirements.txt
