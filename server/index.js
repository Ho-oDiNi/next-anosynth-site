import cors from "cors";
import express from "express";
import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");

const PYTHON_SCRIPT_PATH = path.resolve(
  PROJECT_ROOT,
  "services/synthcity-engine/app/generate.py",
);
const DEFAULT_PORT = 8001;

const app = express();

app.use(cors());
app.use(express.json({ limit: "50mb" }));

function resolvePythonExecutable() {
  if (process.env.PYTHON_BIN) {
    return process.env.PYTHON_BIN;
  }

  return process.platform === "win32"
    ? path.resolve(
        PROJECT_ROOT,
        "services/synthcity-engine/.venv/Scripts/python.exe",
      )
    : path.resolve(PROJECT_ROOT, "services/synthcity-engine/.venv/bin/python");
}

async function ensurePathExists(targetPath, label) {
  try {
    await access(targetPath);
  } catch {
    throw new Error(`${label} не найден: ${targetPath}`);
  }
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, status: "up" });
});

app.post("/api/generate", async (req, res) => {
  try {
    const pythonExecutable = resolvePythonExecutable();

    await ensurePathExists(pythonExecutable, "Python executable");
    await ensurePathExists(PYTHON_SCRIPT_PATH, "Python-скрипт");

    console.log("PYTHON_BIN =", pythonExecutable);
    console.log("PYTHON exists =", fs.existsSync(pythonExecutable));
    console.log("PYTHON_SCRIPT =", PYTHON_SCRIPT_PATH);
    console.log("SCRIPT exists =", fs.existsSync(PYTHON_SCRIPT_PATH));

    const pythonProcess = spawn(
      pythonExecutable,
      ["-X", "utf8", "-u", PYTHON_SCRIPT_PATH],
      {
        cwd: path.resolve(PROJECT_ROOT, "services/synthcity-engine"),
        env: {
          ...process.env,
          PYTHONUTF8: "1",
          PYTHONIOENCODING: "utf-8",
        },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    let stdoutBuffer = "";
    let stderrBuffer = "";

    pythonProcess.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdoutBuffer += text;
    });

    pythonProcess.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderrBuffer += text;
      process.stderr.write(`[PYTHON] ${text}`);
    });

    pythonProcess.on("error", (error) => {
      if (res.headersSent) {
        return;
      }

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
          error:
            error instanceof Error
              ? `Некорректный JSON от Python worker: ${error.message}`
              : "Некорректный JSON от Python worker",
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
