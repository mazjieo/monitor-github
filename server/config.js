import "dotenv/config";

export const config = {
  port: Number(process.env.PORT || 4317),
  githubToken: process.env.GITHUB_TOKEN || "",
  refreshCron: process.env.REFRESH_CRON || "*/30 * * * *",
  snapshotWindowHours: Number(process.env.SNAPSHOT_WINDOW_HOURS || 168),
  baselineMinStars: Number(process.env.BASELINE_MIN_STARS || process.env.MIN_STARS || 1000),
  discoveryMinStars: Number(process.env.DISCOVERY_MIN_STARS || 100),
  searchDelayMs: Number(process.env.GITHUB_SEARCH_DELAY_MS || 2200),
  githubRequestTimeoutMs: Number(process.env.GITHUB_REQUEST_TIMEOUT_MS || 30000),
  activeWindowDays: Number(process.env.ACTIVE_WINDOW_DAYS || 7),
  recentWindowDays: Number(process.env.RECENT_WINDOW_DAYS || 30),
  searchLanguages: (process.env.SEARCH_LANGUAGES ||
    "javascript,typescript,python,go,rust,java,cpp,php,ruby,swift,kotlin")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),
  searchTopics: (
    process.env.SEARCH_TOPICS ||
    "ai,llm,agent,rag,mcp,workflow,embedding,inference,saas,boilerplate,starter,template,stripe,auth,directory,seo,waitlist,newsletter,nextjs,react,tailwind,shadcn,dashboard,admin,ui"
  )
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
};

config.minStars = config.discoveryMinStars;
