import "dotenv/config";

export const config = {
  port: Number(process.env.PORT || 4317),
  githubToken: process.env.GITHUB_TOKEN || "",
  refreshCron: process.env.REFRESH_CRON || "*/30 * * * *",
  snapshotWindowHours: Number(process.env.SNAPSHOT_WINDOW_HOURS || 24),
  baselineMinStars: Number(process.env.BASELINE_MIN_STARS || process.env.MIN_STARS || 1000),
  discoveryMinStars: Number(process.env.DISCOVERY_MIN_STARS || process.env.MIN_STARS || 1000),
  activeWindowDays: Number(process.env.ACTIVE_WINDOW_DAYS || 7),
  recentWindowDays: Number(process.env.RECENT_WINDOW_DAYS || 30),
  searchLanguages: (process.env.SEARCH_LANGUAGES ||
    "javascript,typescript,python,go,rust,java,cpp,php,ruby,swift,kotlin")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),
  searchTopics: (process.env.SEARCH_TOPICS || "ai,llm,agent,rag,mcp,cli")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
};

config.minStars = config.discoveryMinStars;
