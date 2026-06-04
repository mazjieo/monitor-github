import { db } from "./db.js";
import { config } from "./config.js";
import { getGroups, isWatchGroup, normalizeGroupId } from "./groups.js";

export const rankingModes = [
  { id: "opportunity", name: "机会总榜" },
  { id: "breakout", name: "爆发榜" },
  { id: "early", name: "早期机会榜" },
  { id: "indie", name: "Indie Hacker 榜" },
  { id: "cloneable", name: "可抄作业榜" },
  { id: "ai", name: "AI / Agent / MCP 新项目榜" }
];

const rankingModeIds = new Set(rankingModes.map((item) => item.id));

const signalGroups = {
  monetization: [
    { label: "SaaS", terms: ["saas", "multi-tenant", "multitenant", "subscription"] },
    { label: "Stripe", terms: ["stripe", "payment", "checkout", "billing", "invoice"] },
    { label: "Auth", terms: ["auth", "authentication", "login", "oauth", "clerk", "nextauth", "supabase"] },
    { label: "Directory", terms: ["directory", "marketplace", "listing"] },
    { label: "SEO", terms: ["seo", "programmatic seo", "landing page"] },
    { label: "Waitlist", terms: ["waitlist", "prelaunch"] },
    { label: "Newsletter", terms: ["newsletter", "email marketing"] },
    { label: "Boilerplate", terms: ["boilerplate", "starter", "template"] }
  ],
  cloneability: [
    { label: "Next.js", terms: ["nextjs", "next.js", "next-js"] },
    { label: "React", terms: ["react"] },
    { label: "Tailwind", terms: ["tailwind", "tailwindcss"] },
    { label: "shadcn/ui", terms: ["shadcn", "shadcn/ui"] },
    { label: "Template", terms: ["template", "starter", "boilerplate", "scaffold"] },
    { label: "Dashboard", terms: ["dashboard", "admin", "analytics"] },
    { label: "UI", terms: ["ui", "component", "design system"] }
  ],
  ai: [
    { label: "AI", terms: ["ai", "artificial intelligence"] },
    { label: "LLM", terms: ["llm", "large language model"] },
    { label: "Agent", terms: ["agent", "agents", "ai agent"] },
    { label: "RAG", terms: ["rag", "retrieval augmented"] },
    { label: "MCP", terms: ["mcp", "model context protocol"] },
    { label: "Workflow", terms: ["workflow", "automation"] },
    { label: "Embedding", terms: ["embedding", "embeddings", "vector"] },
    { label: "Inference", terms: ["inference", "serving"] }
  ],
  suspicious: [
    { label: "营销式描述", terms: ["ultimate", "viral", "growth hack", "make money fast", "get rich"] },
    { label: "下载/破解", terms: ["download", "crack", "cracked", "破解", "破解版", "serial key"] },
    { label: "刷量/黑产", terms: ["free followers", "stars bot", "traffic bot", "crypto bot", "airdrop", "pump"] },
    { label: "高风险投机", terms: ["casino", "gambling", "betting", "crypto trading bot"] }
  ]
};

function number(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value) {
  return Math.round(value * 10) / 10;
}

function hoursBetween(a, b) {
  return Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 36e5);
}

function trendScore({ starDelta, observedStarsPerHour, stars, pushedAt, snapshotCount, coldStart, now }) {
  const pushedAgeHours = hoursBetween(pushedAt, now);
  const growthScore = Math.log1p(starDelta) * 45;
  const velocityScore = Math.log1p(observedStarsPerHour) * 35;
  const baseScore = Math.log10(Math.max(1, stars)) * 6;
  const activityScore = Math.max(0, 20 - pushedAgeHours / 12);
  const confidenceScore = Math.min(snapshotCount, 6) * 2;
  const coldStartPenalty = coldStart ? 60 : 0;

  return Math.max(0, growthScore + velocityScore + baseScore + activityScore + confidenceScore - coldStartPenalty);
}

function normalizeMode(mode) {
  return rankingModeIds.has(mode) ? mode : "opportunity";
}

function searchableText(repo) {
  return [repo.fullName, repo.name, repo.owner, repo.description, repo.language, ...(repo.topics || [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function findSignals(text, group) {
  return signalGroups[group]
    .filter((signal) => signal.terms.some((term) => text.includes(term.toLowerCase())))
    .map((signal) => signal.label);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function formatSignalList(values) {
  return values.slice(0, 3).join("、");
}

function scoreOpportunity(repo, now) {
  const text = searchableText(repo);
  const monetizationSignals = findSignals(text, "monetization");
  const cloneabilitySignals = findSignals(text, "cloneability");
  const aiSignals = findSignals(text, "ai");
  const suspiciousTextSignals = findSignals(text, "suspicious");
  const ageDays = hoursBetween(repo.createdAt, now) / 24;
  const pushedAgeHours = hoursBetween(repo.pushedAt, now);
  const relativeGrowth = repo.stars > 0 ? repo.starDelta / repo.stars : 0;
  const forkRatio = repo.stars > 0 ? repo.forks / repo.stars : 0;
  const topicCount = repo.topics?.length || 0;

  let early = 0;
  if (repo.stars >= 100 && repo.stars <= 300) early = 18;
  else if (repo.stars <= 1000) early = 16;
  else if (repo.stars <= 3000) early = 12;
  else if (repo.stars <= 10000) early = 5;
  if (ageDays <= 90) early += 5;
  else if (ageDays <= 365) early += 3;
  early = clamp(early, 0, 20);

  const growth = clamp(Math.log1p(repo.starDelta) * 4.2 + Math.log1p(repo.starsPerHour || 0) * 5.5, 0, 22);
  const relativeGrowthScore = clamp(relativeGrowth * 420, 0, 14);
  const freshness = clamp(
    (pushedAgeHours <= 24 ? 8 : pushedAgeHours <= 72 ? 6 : pushedAgeHours <= 168 ? 3 : 0) +
      (ageDays <= 30 ? 8 : ageDays <= 180 ? 5 : ageDays <= 365 ? 3 : 0),
    0,
    16
  );
  const cloneability = clamp(cloneabilitySignals.length * 3.2, 0, 12);
  const monetization = clamp(monetizationSignals.length * 3, 0, 12);
  const aiOpportunity = clamp(aiSignals.length * 2.8, 0, 10);
  const quality = clamp(
    Math.log1p(repo.forks) * 1.4 +
      (repo.openIssues > 0 ? 2.5 : 0) +
      Math.min(topicCount, 6) * 0.8 +
      (pushedAgeHours <= 72 ? 2.5 : 0),
    0,
    14
  );

  const suspiciousSignals = [...suspiciousTextSignals];
  if (repo.starDelta >= 300 && forkRatio < 0.01 && repo.openIssues <= 1 && topicCount <= 1) {
    suspiciousSignals.push("高增长但 forks/issues/topics 很少");
  }
  if (repo.stars >= 5000 && repo.forks < 15 && topicCount === 0) {
    suspiciousSignals.push("高 stars 但社区协作信号很弱");
  }
  if (relativeGrowth >= 0.35 && repo.starDelta >= 200 && repo.snapshotCount <= 2) {
    suspiciousSignals.push("短窗口暴涨且快照置信度低");
  }

  const suspiciousPenalty = clamp(unique(suspiciousSignals).length * 8, 0, 30);
  const rawScore =
    early +
    growth +
    relativeGrowthScore +
    freshness +
    cloneability +
    monetization +
    aiOpportunity +
    quality -
    suspiciousPenalty;
  const opportunityScore = Math.round(clamp(rawScore, 0, 100));

  const opportunityTags = [];
  if (repo.starDelta >= 50 || repo.starsPerHour >= 2) opportunityTags.push("爆发增长");
  if (repo.stars >= 100 && repo.stars <= 3000 && (repo.starDelta >= 20 || relativeGrowth >= 0.03 || ageDays <= 180)) {
    opportunityTags.push("早期爆发");
  }
  if (monetizationSignals.length) opportunityTags.push(monetizationSignals.includes("SaaS") ? "SaaS 模板" : "变现线索");
  if (cloneabilitySignals.length) opportunityTags.push("可抄作业");
  if (aiSignals.length) opportunityTags.push(aiSignals.includes("Agent") ? "AI Agent" : "AI 机会");
  if (suspiciousSignals.length) opportunityTags.push("疑似刷星");

  const opportunityReasons = [];
  if (repo.starDelta > 0) {
    opportunityReasons.push(`窗口新增 ${repo.starDelta} stars，约 ${round(repo.starsPerHour || 0)} stars/hour`);
  } else if (repo.coldStart) {
    opportunityReasons.push("刚进入采样池，等待下一次快照确认真实增速");
  }
  if (relativeGrowth >= 0.01) {
    opportunityReasons.push(`相对增长 ${(relativeGrowth * 100).toFixed(1)}%，基数 ${repo.stars} stars`);
  }
  if (repo.stars >= 100 && repo.stars <= 3000) {
    opportunityReasons.push("stars 仍处早期区间，适合研究、复用或二开");
  }
  if (ageDays <= 365) {
    opportunityReasons.push(`创建约 ${Math.max(1, Math.round(ageDays))} 天，项目仍较新`);
  }
  if (monetizationSignals.length) {
    opportunityReasons.push(`命中变现相关信号：${formatSignalList(monetizationSignals)}`);
  }
  if (cloneabilitySignals.length) {
    opportunityReasons.push(`命中可复用技术/模板信号：${formatSignalList(cloneabilitySignals)}`);
  }
  if (aiSignals.length) {
    opportunityReasons.push(`命中 AI 机会信号：${formatSignalList(aiSignals)}`);
  }
  if (suspiciousSignals.length) {
    opportunityReasons.push(`需要复核：${formatSignalList(unique(suspiciousSignals))}`);
  }

  return {
    opportunityScore,
    opportunityTags: unique(opportunityTags).slice(0, 5),
    opportunityReasons: unique(opportunityReasons).slice(0, 6),
    monetizationSignals: unique(monetizationSignals),
    cloneabilitySignals: unique(cloneabilitySignals),
    suspiciousSignals: unique(suspiciousSignals),
    scoreBreakdown: {
      early: round(early),
      growth: round(growth),
      relativeGrowth: round(relativeGrowthScore),
      freshness: round(freshness),
      cloneability: round(cloneability),
      monetization: round(monetization),
      aiOpportunity: round(aiOpportunity),
      quality: round(quality),
      suspiciousPenalty: round(suspiciousPenalty),
      rawScore: round(rawScore),
      final: opportunityScore
    }
  };
}

function compareNumbers(...values) {
  for (const value of values) {
    if (value !== 0) return value;
  }
  return 0;
}

function rankItems(items, mode) {
  const normalizedMode = normalizeMode(mode);
  const filtered = items.filter((item) => {
    if (normalizedMode === "early") return item.stars >= 100 && item.stars <= 3000;
    if (normalizedMode === "indie") return item.monetizationSignals.length > 0;
    if (normalizedMode === "cloneable") return item.cloneabilitySignals.length > 0;
    if (normalizedMode === "ai") return item.scoreBreakdown.aiOpportunity > 0;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (normalizedMode === "breakout") {
      return compareNumbers(
        Number(a.coldStart) - Number(b.coldStart),
        b.starDelta - a.starDelta,
        b.starsPerHour - a.starsPerHour,
        b.trendScore - a.trendScore,
        b.opportunityScore - a.opportunityScore
      );
    }
    if (normalizedMode === "early") {
      return compareNumbers(
        b.scoreBreakdown.early - a.scoreBreakdown.early,
        b.scoreBreakdown.growth - a.scoreBreakdown.growth,
        b.scoreBreakdown.relativeGrowth - a.scoreBreakdown.relativeGrowth,
        new Date(b.createdAt) - new Date(a.createdAt),
        b.opportunityScore - a.opportunityScore
      );
    }
    if (normalizedMode === "indie") {
      return compareNumbers(
        b.scoreBreakdown.monetization - a.scoreBreakdown.monetization,
        b.opportunityScore - a.opportunityScore,
        b.starDelta - a.starDelta,
        b.starsPerHour - a.starsPerHour
      );
    }
    if (normalizedMode === "cloneable") {
      return compareNumbers(
        b.scoreBreakdown.cloneability - a.scoreBreakdown.cloneability,
        b.opportunityScore - a.opportunityScore,
        b.starDelta - a.starDelta,
        b.starsPerHour - a.starsPerHour
      );
    }
    if (normalizedMode === "ai") {
      return compareNumbers(
        b.scoreBreakdown.aiOpportunity - a.scoreBreakdown.aiOpportunity,
        b.scoreBreakdown.freshness - a.scoreBreakdown.freshness,
        b.opportunityScore - a.opportunityScore,
        b.starDelta - a.starDelta
      );
    }

    return compareNumbers(
      b.opportunityScore - a.opportunityScore,
      b.trendScore - a.trendScore,
      b.starDelta - a.starDelta,
      b.starsPerHour - a.starsPerHour,
      b.stars - a.stars
    );
  });

  return sorted;
}

function getRankings(items, limit) {
  return Object.fromEntries(rankingModes.map((mode) => [mode.id, rankItems(items, mode.id).slice(0, limit)]));
}

function getStarHistory(repoId, since) {
  return db
    .prepare(`
      select stargazers_count as stars, captured_at as capturedAt
      from star_snapshots
      where repo_id = ? and captured_at >= ?
      order by captured_at asc
    `)
    .all(repoId, since);
}

function groupCondition(groupId, alias = "r") {
  if (isWatchGroup(groupId)) {
    return `(not exists (select 1 from repo_groups) or exists (
        select 1
        from repo_groups rg
        where rg.repo_id = ${alias}.id
          and rg.group_id != 'global'
      )
    )`;
  }

  if (groupId === "global") {
    return `(not exists (select 1 from repo_groups) or exists (
        select 1
        from repo_groups rg
        where rg.repo_id = ${alias}.id
          and rg.group_id = @groupId
      )
    )`;
  }

  return `exists (
      select 1
      from repo_groups rg
      where rg.repo_id = ${alias}.id
        and rg.group_id = @groupId
    )`;
}

export function getTrending({ windowHours = 24, language = "", group = "watch", limit = 50, mode = "opportunity" } = {}) {
  const hours = Math.min(Math.max(number(windowHours, 24), 1), 168);
  const maxRows = Math.min(Math.max(number(limit, 50), 1), 100);
  const candidateLimit = Math.min(Math.max(maxRows * 10, 300), 1000);
  const groupId = normalizeGroupId(group);
  const rankingMode = normalizeMode(mode);
  const now = new Date().toISOString();
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const params = { since, language: language || null, groupId, limit: candidateLimit, minStars: config.minStars };

  const rows = db
    .prepare(`
      with recent as (
        select
          repo_id,
          min(captured_at) as first_seen,
          max(captured_at) as last_seen
        from star_snapshots
        where captured_at >= @since
        group by repo_id
      )
      select
        r.*,
        first_snapshot.stargazers_count as first_stars,
        last_snapshot.stargazers_count as last_stars,
        recent.first_seen,
        recent.last_seen,
        (
          select count(*)
          from star_snapshots s
          where s.repo_id = r.id and s.captured_at >= @since
        ) as snapshot_count
      from repositories r
      left join recent on recent.repo_id = r.id
      left join star_snapshots first_snapshot
        on first_snapshot.repo_id = r.id and first_snapshot.captured_at = recent.first_seen
      left join star_snapshots last_snapshot
        on last_snapshot.repo_id = r.id and last_snapshot.captured_at = recent.last_seen
      where r.stargazers_count >= @minStars
        and (@language is null or lower(r.language) = lower(@language))
        and ${groupCondition(groupId)}
      order by r.last_seen_at desc
      limit @limit
    `)
    .all(params);

  const enrichedItems = rows.map((row) => {
    const observedHours = row.first_seen && row.last_seen ? hoursBetween(row.first_seen, row.last_seen) : 0;
    const starDelta = Math.max(0, (row.last_stars || row.stargazers_count) - (row.first_stars || row.stargazers_count));
    const createdHours = Math.max(1, hoursBetween(row.created_at, now));
    const observedStarsPerHour = observedHours > 0 ? starDelta / observedHours : 0;
    const estimatedStarsPerHour = row.stargazers_count / createdHours;
    const coldStart = observedHours === 0;
    const baseItem = {
      id: row.id,
      fullName: row.full_name,
      name: row.name,
      owner: row.owner,
      description: row.description,
      url: row.html_url,
      language: row.language,
      topics: JSON.parse(row.topics || "[]"),
      stars: row.stargazers_count,
      forks: row.forks_count,
      openIssues: row.open_issues_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      pushedAt: row.pushed_at,
      lastSeenAt: row.last_seen_at,
      firstSeen: row.first_seen,
      lastSeen: row.last_seen,
      snapshotCount: row.snapshot_count || 0,
      starHistory: getStarHistory(row.id, since),
      starDelta,
      observedHours,
      starsPerHour: observedStarsPerHour,
      observedStarsPerHour,
      estimatedStarsPerHour,
      trendScore: trendScore({
        starDelta,
        observedStarsPerHour,
        stars: row.stargazers_count,
        pushedAt: row.pushed_at,
        snapshotCount: row.snapshot_count || 0,
        coldStart,
        now
      }),
      coldStart
    };

    return {
      ...baseItem,
      ...scoreOpportunity(baseItem, now)
    };
  });

  const rankings = getRankings(enrichedItems, maxRows);

  return {
    generatedAt: new Date().toISOString(),
    windowHours: hours,
    language: language || "all",
    group: groupId,
    mode: rankingMode,
    rankingModes,
    minStars: config.minStars,
    rankings,
    items: rankings[rankingMode]
  };
}

export function getLanguages({ group = "watch" } = {}) {
  const groupId = normalizeGroupId(group);
  return db
    .prepare(`
      select language, count(*) as count
      from repositories r
      where language is not null and language != ''
        and stargazers_count >= @minStars
        and ${groupCondition(groupId)}
      group by language
      order by count desc, language asc
    `)
    .all({ minStars: config.minStars, groupId });
}

export function getTrendGroups() {
  return getGroups();
}
