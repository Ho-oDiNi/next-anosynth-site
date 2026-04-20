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

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function extractTaggedJson(buffer, tag) {
  const lines = buffer
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];

    if (!line.startsWith(tag)) {
      continue;
    }

    const parsed = safeJsonParse(line.slice(tag.length).trim());
    if (parsed) {
      return parsed;
    }
  }

  return null;
}

function extractLastJsonObject(buffer) {
  const lines = buffer
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];

    if (!line.startsWith("{") || !line.endsWith("}")) {
      continue;
    }

    const parsed = safeJsonParse(line);
    if (parsed) {
      return parsed;
    }
  }

  const firstBraceIndex = buffer.indexOf("{");
  const lastBraceIndex = buffer.lastIndexOf("}");

  if (
    firstBraceIndex !== -1 &&
    lastBraceIndex !== -1 &&
    lastBraceIndex > firstBraceIndex
  ) {
    const candidate = buffer.slice(firstBraceIndex, lastBraceIndex + 1).trim();
    const parsed = safeJsonParse(candidate);
    if (parsed) {
      return parsed;
    }
  }

  return null;
}

function extractWorkerPayload(buffer, tag) {
  return extractTaggedJson(buffer, tag) ?? extractLastJsonObject(buffer);
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
      const text = chunk.toString("utf8");
      stdoutBuffer += text;
    });

    pythonProcess.stderr.on("data", (chunk) => {
      const text = chunk.toString("utf8");
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
        const parsedError = extractWorkerPayload(stderrBuffer, "__ERROR__") ??
          extractWorkerPayload(stdoutBuffer, "__ERROR__") ?? {
            ok: false,
            error:
              stderrBuffer.trim() ||
              stdoutBuffer.trim() ||
              "Ошибка Python worker",
          };

        res.status(500).json(parsedError);
        return;
      }

      const parsedResult =
        extractWorkerPayload(stdoutBuffer, "__RESULT__") ??
        extractWorkerPayload(stderrBuffer, "__RESULT__");

      if (!parsedResult) {
        res.status(500).json({
          ok: false,
          error: "Не удалось извлечь JSON-ответ Python worker",
          rawStdout: stdoutBuffer.trim(),
          rawStderr: stderrBuffer.trim(),
        });
        return;
      }

      res.json(parsedResult);
    });

    pythonProcess.stdin.write(JSON.stringify(req.body), "utf8");
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
