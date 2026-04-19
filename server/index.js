import cors from "cors";
import express from "express";
import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");
const PYTHON_SCRIPT_PATH = path.resolve(
  PROJECT_ROOT,
  "services/synthcity-engine/scripts/generate_once.py",
);
const DEFAULT_PORT = 8001;

const app = express();

app.use(cors());
app.use(express.json({ limit: "50mb" }));

function resolvePythonExecutable() {
  if (process.env.PYTHON_BIN) {
    return process.env.PYTHON_BIN;
  }

  const venvPython = path.resolve(PROJECT_ROOT, ".venv/bin/python");
  return process.platform === "win32"
    ? path.resolve(PROJECT_ROOT, ".venv/Scripts/python.exe")
    : venvPython;
}

async function ensureScriptExists() {
  try {
    await access(PYTHON_SCRIPT_PATH);
  } catch {
    throw new Error(`Python-скрипт не найден: ${PYTHON_SCRIPT_PATH}`);
  }
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, status: "up" });
});

app.post("/api/generate", async (req, res) => {
  try {
    await ensureScriptExists();

    const pythonExecutable = resolvePythonExecutable();
    const pythonProcess = spawn(pythonExecutable, [PYTHON_SCRIPT_PATH], {
      cwd: PROJECT_ROOT,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdoutBuffer = "";
    let stderrBuffer = "";

    pythonProcess.stdout.on("data", (chunk) => {
      stdoutBuffer += chunk.toString();
    });

    pythonProcess.stderr.on("data", (chunk) => {
      stderrBuffer += chunk.toString();
    });

    pythonProcess.on("error", (error) => {
      res.status(500).json({
        ok: false,
        error: `Не удалось запустить Python-процесс: ${error.message}`,
      });
    });

    pythonProcess.on("close", (exitCode) => {
      if (res.headersSent) {
        return;
      }

      if (exitCode !== 0) {
        let parsedError = { ok: false, error: "Ошибка Python worker" };
        if (stderrBuffer.trim()) {
          try {
            parsedError = JSON.parse(stderrBuffer);
          } catch {
            parsedError = { ok: false, error: stderrBuffer.trim() };
          }
        }

        res.status(500).json(parsedError);
        return;
      }

      try {
        const parsedStdout = JSON.parse(stdoutBuffer);
        res.json(parsedStdout);
      } catch (error) {
        res.status(500).json({
          ok: false,
          error: `Некорректный JSON от Python worker: ${error.message}`,
          raw: stdoutBuffer.trim(),
        });
      }
    });

    pythonProcess.stdin.write(JSON.stringify(req.body));
    pythonProcess.stdin.end();
  } catch (error) {
    res.status(500).json({
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Неизвестная ошибка backend-сервера",
    });
  }
});

const port = Number(process.env.SERVER_PORT ?? DEFAULT_PORT);
app.listen(port, () => {
  console.log(`Node backend запущен на http://localhost:${port}`);
});
