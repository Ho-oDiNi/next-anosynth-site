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

const PYTHON_GENERATE_SCRIPT_PATH = path.resolve(
  PROJECT_ROOT,
  "services/synthcity-engine/app/generate.py",
);
const PYTHON_SYNTHCITY_EVALUATE_SCRIPT_PATH = path.resolve(
  PROJECT_ROOT,
  "services/synthcity-engine/app/evaluate.py",
);
const PYTHON_SDMETRICS_EVALUATE_SCRIPT_PATH = path.resolve(
  PROJECT_ROOT,
  "services/sdmetrics-engine/app/evalute.py",
);

const DEFAULT_PORT = 8001;

const app = express();

app.use(cors());
app.use(express.json({ limit: "50mb" }));

function resolvePythonExecutable(engineName = "synthcity-engine") {
  if (process.env.PYTHON_BIN) {
    return process.env.PYTHON_BIN;
  }

  return process.platform === "win32"
    ? path.resolve(PROJECT_ROOT, `services/${engineName}/.venv/Scripts/python.exe`)
    : path.resolve(PROJECT_ROOT, `services/${engineName}/.venv/bin/python`);
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

function normalizeResultsArray(results) {
  return Array.isArray(results) ? results : [];
}

function runPythonWorker({
  pythonExecutable,
  scriptPath,
  cwd,
  requestPayload,
}) {
  return new Promise((resolve, reject) => {
    const pythonProcess = spawn(pythonExecutable, ["-X", "utf8", "-u", scriptPath], {
      cwd,
      env: {
        ...process.env,
        PYTHONUTF8: "1",
        PYTHONIOENCODING: "utf-8",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdoutBuffer = "";
    let stderrBuffer = "";

    pythonProcess.stdout.on("data", (chunk) => {
      stdoutBuffer += chunk.toString("utf8");
    });

    pythonProcess.stderr.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      stderrBuffer += text;
      process.stderr.write(`[PYTHON] ${text}`);
    });

    pythonProcess.on("error", (error) => {
      reject(new Error(`Не удалось запустить Python-процесс: ${error.message}`));
    });

    pythonProcess.on("close", (exitCode) => {
      if (exitCode !== 0) {
        const parsedError = extractWorkerPayload(stderrBuffer, "__ERROR__") ??
          extractWorkerPayload(stdoutBuffer, "__ERROR__") ?? {
            ok: false,
            error:
              stderrBuffer.trim() ||
              stdoutBuffer.trim() ||
              "Ошибка Python worker",
          };

        reject(new Error(parsedError.error ?? "Ошибка Python worker"));
        return;
      }

      const parsedResult =
        extractWorkerPayload(stdoutBuffer, "__RESULT__") ??
        extractWorkerPayload(stderrBuffer, "__RESULT__");

      if (!parsedResult) {
        reject(new Error("Не удалось извлечь JSON-ответ Python worker"));
        return;
      }

      resolve(parsedResult);
    });

    pythonProcess.stdin.write(JSON.stringify(requestPayload), "utf8");
    pythonProcess.stdin.end();
  });
}

function buildMetricWorkerPayload({
  requestBody,
  metrics,
}) {
  return {
    ...requestBody,
    metrics,
  };
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, status: "up" });
});

app.post("/api/generate", async (req, res) => {
  try {
    const pythonExecutable = resolvePythonExecutable("synthcity-engine");

    await ensurePathExists(pythonExecutable, "Python executable");
    await ensurePathExists(PYTHON_GENERATE_SCRIPT_PATH, "Python-скрипт");

    console.log("PYTHON_BIN =", pythonExecutable);
    console.log("PYTHON exists =", fs.existsSync(pythonExecutable));
    console.log("PYTHON_SCRIPT =", PYTHON_GENERATE_SCRIPT_PATH);
    console.log("SCRIPT exists =", fs.existsSync(PYTHON_GENERATE_SCRIPT_PATH));

    const result = await runPythonWorker({
      pythonExecutable,
      scriptPath: PYTHON_GENERATE_SCRIPT_PATH,
      cwd: path.resolve(PROJECT_ROOT, "services/synthcity-engine"),
      requestPayload: req.body,
    });

    res.json(result);
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

app.post("/api/evaluate", async (req, res) => {
  try {
    const synthcityMetrics = Array.isArray(req.body?.synthcityMetrics)
      ? req.body.synthcityMetrics
      : [];
    const sdmetricsMetrics = Array.isArray(req.body?.sdmetricsMetrics)
      ? req.body.sdmetricsMetrics
      : [];

    if (synthcityMetrics.length === 0 && sdmetricsMetrics.length === 0) {
      res.status(400).json({
        ok: false,
        error: "Не выбраны метрики для оценивания",
      });
      return;
    }

    const synthcityPythonExecutable = resolvePythonExecutable("synthcity-engine");
    const sdmetricsPythonExecutable = resolvePythonExecutable("sdmetrics-engine");

    await Promise.all([
      ensurePathExists(synthcityPythonExecutable, "Python executable synthcity"),
      ensurePathExists(sdmetricsPythonExecutable, "Python executable sdmetrics"),
      ensurePathExists(PYTHON_SYNTHCITY_EVALUATE_SCRIPT_PATH, "Скрипт evaluate.py"),
      ensurePathExists(PYTHON_SDMETRICS_EVALUATE_SCRIPT_PATH, "Скрипт evalute.py"),
    ]);

    const workerCalls = [];

    if (synthcityMetrics.length > 0) {
      workerCalls.push(
        runPythonWorker({
          pythonExecutable: synthcityPythonExecutable,
          scriptPath: PYTHON_SYNTHCITY_EVALUATE_SCRIPT_PATH,
          cwd: path.resolve(PROJECT_ROOT, "services/synthcity-engine"),
          requestPayload: buildMetricWorkerPayload({
            requestBody: req.body,
            metrics: synthcityMetrics,
          }),
        }),
      );
    }

    if (sdmetricsMetrics.length > 0) {
      workerCalls.push(
        runPythonWorker({
          pythonExecutable: sdmetricsPythonExecutable,
          scriptPath: PYTHON_SDMETRICS_EVALUATE_SCRIPT_PATH,
          cwd: path.resolve(PROJECT_ROOT, "services/sdmetrics-engine"),
          requestPayload: buildMetricWorkerPayload({
            requestBody: req.body,
            metrics: sdmetricsMetrics,
          }),
        }),
      );
    }

    const responses = await Promise.all(workerCalls);

    const mergedResults = responses.flatMap((item) => normalizeResultsArray(item.results));
    const evaluationId = responses
      .map((item) => item.evaluationId)
      .filter(Boolean)
      .join("+") || `evaluation-${Date.now()}`;

    res.json({
      ok: true,
      evaluationId,
      results: mergedResults,
    });
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
