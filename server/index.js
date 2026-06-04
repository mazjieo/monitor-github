import cors from "cors";
import express from "express";
import cron from "node-cron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { refreshTrending } from "./github.js";
import { getLanguages, getTrending, getTrendGroups } from "./trending.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(express.json());

let lastRefresh = null;
let refreshInFlight = null;

async function runRefresh() {
  if (!refreshInFlight) {
    refreshInFlight = refreshTrending()
      .then((result) => {
        lastRefresh = { ok: true, ...result };
        return lastRefresh;
      })
      .catch((error) => {
        lastRefresh = {
          ok: false,
          capturedAt: new Date().toISOString(),
          error: error.message
        };
        throw error;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }

  return refreshInFlight;
}

app.get("/api/health", (_request, response) => {
  response.json({ ok: true, lastRefresh });
});

app.get("/api/groups", (_request, response) => {
  response.json({ items: getTrendGroups() });
});

app.get("/api/languages", (request, response) => {
  response.json({ items: getLanguages({ group: request.query.group }) });
});

app.get("/api/trending", (request, response) => {
  response.json(
    getTrending({
      windowHours: request.query.windowHours,
      language: request.query.language,
      group: request.query.group,
      mode: request.query.mode,
      limit: request.query.limit
    })
  );
});

app.post("/api/refresh", async (_request, response) => {
  try {
    response.json(await runRefresh());
  } catch (error) {
    response.status(502).json({ ok: false, error: error.message });
  }
});

const distDir = path.resolve(__dirname, "..", "dist");
app.use(express.static(distDir));
app.get(/.*/, (_request, response) => {
  response.sendFile(path.join(distDir, "index.html"));
});

cron.schedule(config.refreshCron, () => {
  runRefresh().catch((error) => {
    console.error(`[refresh] ${error.message}`);
  });
});

app.listen(config.port, () => {
  console.log(`Open Source Opportunity Radar API listening on http://127.0.0.1:${config.port}`);
  runRefresh().catch((error) => {
    console.error(`[initial refresh] ${error.message}`);
  });
});
