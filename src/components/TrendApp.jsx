import React, { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowUpRight,
  BadgeCheck,
  BarChart3,
  BookmarkPlus,
  Clock3,
  Code2,
  Copy,
  EyeOff,
  Filter,
  GitBranch,
  GitFork,
  ListChecks,
  Radio,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  X,
  Zap
} from "lucide-react";

const windows = [
  { label: "6h", value: 6 },
  { label: "24h", value: 24 },
  { label: "3d", value: 72 },
  { label: "7d", value: 168 }
];
const defaultRankingModes = [
  { id: "opportunity", name: "机会总榜" },
  { id: "discovery", name: "发现榜" },
  { id: "breakout", name: "爆发榜" },
  { id: "early", name: "早期机会榜" },
  { id: "indie", name: "Indie Hacker 榜" },
  { id: "cloneable", name: "可抄作业榜" },
  { id: "ai", name: "AI / Agent / MCP 新项目榜" }
];
const pageSize = 10;
const autoRefreshMs = 5 * 60 * 1000;
const ignoredStorageKey = "ignoredRepos";
const researchQueueStorageKey = "researchQueue";
const personalTabs = [
  { id: "research", name: "研究队列" },
  { id: "ignored", name: "已忽略" }
];

const numberFmt = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const fullNumberFmt = new Intl.NumberFormat("en");
const dateFmt = new Intl.DateTimeFormat("zh-CN", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit"
});
const chartTimeFmt = new Intl.DateTimeFormat("zh-CN", {
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit"
});

function formatNumber(value) {
  return numberFmt.format(value || 0);
}

function formatFullNumber(value) {
  return fullNumberFmt.format(value || 0);
}

function formatVelocity(value) {
  if (value >= 10) return value.toFixed(1);
  if (value >= 1) return value.toFixed(2);
  return value.toFixed(3);
}

function repoVelocityLabel(repo) {
  return repo?.coldStart ? "待复测" : formatVelocity(repo?.starsPerHour || 0);
}

function repoVelocityUnit(repo) {
  return repo?.coldStart ? "下一次快照后计算" : "stars / hour";
}

function timeAgo(value) {
  if (!value) return "暂无";
  return dateFmt.format(new Date(value));
}

function formatGeneratedAt(value) {
  if (!value) return "等待生成";
  return timeAgo(value);
}

function formatWindow(hours) {
  if (hours < 24) return `${hours} 小时`;
  if (hours === 24) return "24 小时";
  return `${hours / 24} 天`;
}

function getRepoDomain(repo) {
  const text = `${repo.description || ""} ${(repo.topics || []).join(" ")}`.toLowerCase();
  if (text.includes("agent") || text.includes("llm") || text.includes("ai")) return "AI / Agent";
  if (text.includes("database") || text.includes("sql") || text.includes("vector")) return "Data";
  if (text.includes("ui") || text.includes("react") || text.includes("frontend")) return "Frontend";
  if (text.includes("devops") || text.includes("kubernetes") || text.includes("docker")) return "Infra";
  if (text.includes("security") || text.includes("auth") || text.includes("identity")) return "Security";
  return "Open Source";
}

function getRankingItems(sourceData, mode) {
  return sourceData?.rankings?.[mode] || sourceData?.items || [];
}

function formatScore(value) {
  return Number.isFinite(Number(value)) ? Math.round(Number(value)) : 0;
}

function confidenceLabel(score = 0) {
  if (score >= 85) return "高可信";
  if (score >= 60) return "可信";
  if (score >= 40) return "观察";
  return "低置信度";
}

function isReviewTag(tag) {
  return tag === "需要复核" || tag === "社区信号偏弱" || tag === "增长异常" || tag === "快照不足" || tag === "低置信度";
}

function repoStorageId(repo) {
  return String(repo?.repoId ?? repo?.id ?? repo?.fullName ?? "");
}

function normalizeStoredRepos(value) {
  return Array.isArray(value)
    ? value.filter((item) => item && (item.repoId || item.fullName)).map((item) => ({ ...item, repoId: item.repoId ?? item.fullName }))
    : [];
}

function readStoredRepos(key) {
  if (typeof window === "undefined") return [];
  try {
    return normalizeStoredRepos(JSON.parse(window.localStorage.getItem(key) || "[]"));
  } catch {
    return [];
  }
}

function useStoredRepoList(key) {
  const [items, setItems] = useState([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setItems(readStoredRepos(key));
    setReady(true);
  }, [key]);

  useEffect(() => {
    if (!ready || typeof window === "undefined") return;
    window.localStorage.setItem(key, JSON.stringify(items));
  }, [items, key, ready]);

  return [items, setItems];
}

function createRepoMap(repos) {
  const map = new Map();
  repos.forEach((repo) => {
    const key = repoStorageId(repo);
    if (key && !map.has(key)) map.set(key, repo);
  });
  return map;
}

function getAllRankingRepos(sourceData) {
  const rankings = sourceData?.rankings || {};
  const repos = Object.values(rankings).flat();
  return repos.length ? repos : sourceData?.items || [];
}

function buildAnalysisPrompt(repo) {
  return `请分析这个 GitHub 项目：

${repo.url}

重点关注：

1. 项目解决什么问题
2. 是否有商业化机会
3. 是否适合独立开发者
4. 是否适合 SaaS 化
5. 是否值得二开
6. 技术亮点
7. 风险与缺点

最后给出：

- 是否值得 Star
- 是否值得持续关注`;
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall back to a temporary textarea below when browser permissions block clipboard.writeText.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!copied) throw new Error("copy failed");
}

function countTags(entries, repoMap) {
  const counts = new Map();
  entries.forEach((entry) => {
    const repo = repoMap.get(repoStorageId(entry));
    (repo?.opportunityTags || []).forEach((tag) => {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    });
  });
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 6);
}

function entryMatchesFilters(entry, repo, language, query) {
  if (language && repo?.language?.toLowerCase() !== language.toLowerCase()) return false;
  if (!query.trim()) return true;

  const needle = query.trim().toLowerCase();
  return (
    String(repo?.fullName || entry.fullName || "").toLowerCase().includes(needle) ||
    String(repo?.description || "").toLowerCase().includes(needle) ||
    (repo?.topics || []).some((topic) => topic.toLowerCase().includes(needle))
  );
}

function useApi(path, deps, enabled = true) {
  const [state, setState] = useState({ data: null, loading: enabled, error: "" });

  useEffect(() => {
    if (!enabled) {
      setState({ data: null, loading: false, error: "" });
      return undefined;
    }

    const controller = new AbortController();
    setState((current) => ({ ...current, loading: true, error: "" }));

    fetch(path, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`请求失败：${response.status}`);
        return response.json();
      })
      .then((data) => setState({ data, loading: false, error: "" }))
      .catch((error) => {
        if (error.name !== "AbortError") {
          setState({ data: null, loading: false, error: error.message });
        }
      });

    return () => controller.abort();
  }, [...deps, enabled]);

  return state;
}

function useStaticTrending(refreshTick, initialData) {
  const basePath = import.meta.env.BASE_URL || "/";
  const normalizedBasePath = basePath.endsWith("/") ? basePath : `${basePath}/`;
  const staticPath = `${normalizedBasePath}data/trending.json?t=${refreshTick}`;
  const [state, setState] = useState({
    data: initialData || null,
    loading: !initialData,
    error: ""
  });

  useEffect(() => {
    const controller = new AbortController();
    setState((current) => ({ ...current, loading: true, error: "" }));

    fetch(staticPath, { signal: controller.signal, cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("静态数据还没有生成");
        return response.json();
      })
      .then((data) => setState({ data, loading: false, error: "" }))
      .catch((error) => {
        if (error.name !== "AbortError") {
          setState((current) => ({
            data: current.data,
            loading: false,
            error: current.data ? "" : error.message
          }));
        }
      });

    return () => controller.abort();
  }, [staticPath]);

  return state;
}

function Stat({ icon: Icon, label, value, hint, tone = "" }) {
  return (
    <div className={`stat ${tone}`}>
      <div className="stat-icon">
        <Icon size={18} />
      </div>
      <span>{label}</span>
      <strong>{value}</strong>
      {hint && <small>{hint}</small>}
    </div>
  );
}

function StarTimeChart({ points = [] }) {
  const width = 760;
  const height = 320;
  const margin = { top: 30, right: 28, bottom: 58, left: 78 };
  const plotLeft = margin.left;
  const plotRight = width - margin.right;
  const plotTop = margin.top;
  const plotBottom = height - margin.bottom;
  const plotWidth = plotRight - plotLeft;
  const plotHeight = plotBottom - plotTop;
  const cleaned = points
    .map((point) => ({
      stars: Number(point.stars),
      time: new Date(point.capturedAt).getTime(),
      capturedAt: point.capturedAt
    }))
    .filter((point) => Number.isFinite(point.stars) && Number.isFinite(point.time))
    .sort((a, b) => a.time - b.time);

  if (!cleaned.length) {
    return (
      <svg className="time-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Star count over time">
        <line className="chart-axis" x1={plotLeft} y1={plotBottom} x2={plotRight} y2={plotBottom} />
        <line className="chart-axis" x1={plotLeft} y1={plotTop} x2={plotLeft} y2={plotBottom} />
        <text className="chart-empty" x={(plotLeft + plotRight) / 2} y={(plotTop + plotBottom) / 2}>
          no snapshots
        </text>
      </svg>
    );
  }

  const times = cleaned.map((point) => point.time);
  const values = cleaned.map((point) => point.stars);
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const minStars = Math.min(...values);
  const maxStars = Math.max(...values);
  const timeSpread = Math.max(1, maxTime - minTime);
  const starSpread = Math.max(1, maxStars - minStars);
  const xFor = (time) => (minTime === maxTime ? plotRight : plotLeft + ((time - minTime) / timeSpread) * plotWidth);
  const yFor = (stars) => (minStars === maxStars ? plotTop + plotHeight / 2 : plotBottom - ((stars - minStars) / starSpread) * plotHeight);
  const coords = cleaned.map((point) => ({
    ...point,
    x: xFor(point.time),
    y: yFor(point.stars)
  }));
  const path = coords.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const yTicks = Array.from({ length: 5 }, (_, index) => minStars + (starSpread * index) / 4);
  const xTicks = Array.from({ length: 4 }, (_, index) => minTime + (timeSpread * index) / 3);

  return (
    <svg className="time-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Star count over time">
      {yTicks.map((tick) => {
        const y = yFor(tick);
        return (
          <g key={`y-${tick}`}>
            <line className="chart-grid" x1={plotLeft} y1={y} x2={plotRight} y2={y} />
            <text className="chart-label" x={plotLeft - 10} y={y + 4} textAnchor="end">
              {formatFullNumber(Math.round(tick))}
            </text>
          </g>
        );
      })}
      {xTicks.map((tick) => {
        const x = xFor(tick);
        return (
          <g key={`x-${tick}`}>
            <line className="chart-grid vertical" x1={x} y1={plotTop} x2={x} y2={plotBottom} />
            <text className="chart-label" x={x} y={plotBottom + 25} textAnchor="middle">
              {chartTimeFmt.format(new Date(tick))}
            </text>
          </g>
        );
      })}
      <line className="chart-axis" x1={plotLeft} y1={plotBottom} x2={plotRight} y2={plotBottom} />
      <line className="chart-axis" x1={plotLeft} y1={plotTop} x2={plotLeft} y2={plotBottom} />
      <polyline className="time-chart-line" points={path} />
      {coords.map((point, index) => (
        <circle className="time-chart-dot" key={`${point.capturedAt}-${index}`} r="2.5" cx={point.x} cy={point.y} />
      ))}
      <text className="chart-unit" x={plotLeft} y={18}>
        Stars
      </text>
      <text className="chart-unit" x={(plotLeft + plotRight) / 2} y={height - 14} textAnchor="middle">
        采样时间
      </text>
    </svg>
  );
}

function RepoRow({ repo, rank, onOpen, onAddResearch, onAnalyze, onIgnore, isQueued }) {
  const topics = repo.topics?.slice(0, 4) || [];
  const domain = getRepoDomain(repo);
  const latestSnapshot = repo.lastSeen || repo.starHistory?.[repo.starHistory.length - 1]?.capturedAt;
  const opportunityTags = repo.opportunityTags || [];
  const reasons = repo.whyNow?.slice(0, 1) || repo.opportunityReasons?.slice(0, 1) || [];

  return (
    <article className="repo-row">
      <div className="rank-block">
        <span className="rank-number">{String(rank).padStart(2, "0")}</span>
        <span className="rank-label">rank</span>
      </div>

      <div className="repo-main">
        <div className="repo-heading">
          <a href={repo.url} target="_blank" rel="noreferrer">
            <span>{repo.fullName}</span>
            <ArrowUpRight size={15} />
          </a>
          <span className="language">{repo.language || "Unknown"}</span>
          {domain !== "Open Source" && domain !== repo.language && <span className="domain">{domain}</span>}
        </div>
        <p>{repo.description || "这个仓库暂时没有描述。"}</p>
        <div className="topics">
          {topics.map((topic) => (
            <span key={topic}>{topic}</span>
          ))}
        </div>
        <div className="opportunity-tags">
          {repo.opportunityTier && <span className="tier">{repo.opportunityTier}</span>}
          {Number.isFinite(Number(repo.confidenceScore)) && <span>{confidenceLabel(repo.confidenceScore)}</span>}
          {opportunityTags.map((tag) => (
            <span key={tag} className={isReviewTag(tag) ? "review" : ""}>
              {tag}
            </span>
          ))}
        </div>
        <div className="repo-reasons">
          {reasons.map((reason) => (
            <span key={reason}>{reason}</span>
          ))}
        </div>
      </div>

      <div className="repo-score">
        <div>
          <span>opportunity</span>
          <strong>{formatScore(repo.opportunityScore)}</strong>
          <small>{repo.opportunityTier || "机会评分"} / 100</small>
        </div>
        <div>
          <span>discovery</span>
          <b>{formatScore(repo.discoveryScore)}</b>
          <small>{confidenceLabel(repo.confidenceScore)} {formatScore(repo.confidenceScore)}</small>
        </div>
        <div className="repo-actions">
          <button className="detail-button" onClick={() => onOpen(repo)}>
            <BarChart3 size={16} />
            详情
          </button>
          <button className="detail-button research-action" onClick={() => onAddResearch(repo)} disabled={isQueued}>
            <BookmarkPlus size={16} />
            {isQueued ? "已在队列" : "加入研究队列"}
          </button>
          <button className="detail-button analyze-action" onClick={() => onAnalyze(repo)}>
            <Copy size={16} />
            分析
          </button>
          <button className="detail-button ignore-action" onClick={() => onIgnore(repo)}>
            <EyeOff size={16} />
            忽略
          </button>
        </div>
      </div>

      <div className="repo-metrics">
        <div className="metric-line">
          <Star size={15} />
          <span>{formatNumber(repo.stars)}</span>
        </div>
        <div className="metric-line">
          <GitFork size={15} />
          <span>{formatNumber(repo.forks)}</span>
        </div>
        <div className="metric-line">
          <Clock3 size={15} />
          <span className="metric-copy">
            <small>最后 push</small>
            <b>{timeAgo(repo.pushedAt)}</b>
          </span>
        </div>
        <div className="metric-line">
          <ShieldCheck size={15} />
          <span className="metric-copy">
            <small>快照</small>
            <b>{timeAgo(latestSnapshot)}</b>
          </span>
        </div>
        {repo.coldStart ? <span className="cold-start">估算趋势</span> : <span className="delta">+{repo.starDelta} stars</span>}
      </div>
    </article>
  );
}

function RepoDetailModal({ repo, windowHours, generatedAt, sourceLabel, onClose, onAddResearch, onAnalyze, onIgnore, isQueued }) {
  if (!repo) return null;

  const history = [...(repo.starHistory || [])].sort((a, b) => new Date(a.capturedAt) - new Date(b.capturedAt));
  const latestSnapshot = repo.lastSeen || history[history.length - 1]?.capturedAt;
  const firstSnapshot = repo.firstSeen || history[0]?.capturedAt;
  const topics = repo.topics || [];
  const scoreBreakdown = repo.scoreBreakdown || {};
  const breakdownRows = [
    ["早期程度", "early"],
    ["增长速度", "growth"],
    ["相对增长", "relativeGrowth"],
    ["新鲜度", "freshness"],
    ["置信度", "confidence"],
    ["发现分", "discovery"],
    ["可复用性", "cloneability"],
    ["变现相关", "monetization"],
    ["AI 机会", "aiOpportunity"],
    ["质量信号", "quality"],
    ["复核扣分", "reviewPenalty"]
  ];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="repo-modal" role="dialog" aria-modal="true" aria-label={`${repo.fullName} 机会详情`} onClick={(event) => event.stopPropagation()}>
        <header className="modal-header">
          <div>
            <span className="section-kicker">
              <BarChart3 size={16} />
              机会详情
            </span>
            <a className="modal-title" href={repo.url} target="_blank" rel="noreferrer">
              {repo.fullName}
              <ArrowUpRight size={18} />
            </a>
            <p>{repo.description || "这个仓库暂时没有描述。"}</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="关闭详情">
            <X size={20} />
          </button>
        </header>

        <div className="detail-summary">
          <div>
            <span>机会层级</span>
            <strong>{repo.opportunityTier || "观察"}</strong>
          </div>
          <div>
            <span>机会评分</span>
            <strong>{formatScore(repo.opportunityScore)}</strong>
          </div>
          <div>
            <span>发现分</span>
            <strong>{formatScore(repo.discoveryScore)}</strong>
          </div>
          <div>
            <span>置信度</span>
            <strong>{confidenceLabel(repo.confidenceScore)}</strong>
          </div>
          <div>
            <span>窗口增量</span>
            <strong>+{repo.starDelta}</strong>
          </div>
          <div>
            <span>数据源</span>
            <strong>{sourceLabel}</strong>
          </div>
        </div>

        <div className="modal-actions">
          <button className="detail-button research-action" onClick={() => onAddResearch(repo)} disabled={isQueued}>
            <BookmarkPlus size={16} />
            {isQueued ? "已在研究队列" : "加入研究队列"}
          </button>
          <button className="detail-button analyze-action" onClick={() => onAnalyze(repo)}>
            <Copy size={16} />
            复制分析 Prompt
          </button>
          <button className="detail-button ignore-action" onClick={() => onIgnore(repo)}>
            <EyeOff size={16} />
            忽略
          </button>
        </div>

        <section className="opportunity-panel">
          <div>
            <h3>为什么上榜</h3>
            <div className="opportunity-tags">
              {repo.opportunityTier && <span className="tier">{repo.opportunityTier}</span>}
              {Number.isFinite(Number(repo.confidenceScore)) && <span>{confidenceLabel(repo.confidenceScore)} {formatScore(repo.confidenceScore)}</span>}
              {(repo.opportunityTags || []).map((tag) => (
                <span key={tag} className={isReviewTag(tag) ? "review" : ""}>
                  {tag}
                </span>
              ))}
            </div>
            <h3 className="subsection-title">为什么现在值得看</h3>
            <ul className="reason-list">
              {(repo.whyNow || []).map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
            <h3 className="subsection-title">补充原因</h3>
            <ul className="reason-list">
              {(repo.opportunityReasons || []).map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3>Score Breakdown</h3>
            <div className="breakdown-grid">
              {breakdownRows.map(([label, key]) => (
                <div key={key}>
                  <span>{label}</span>
                  <strong>{formatScore(scoreBreakdown[key])}</strong>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="detail-chart-panel">
          <div className="chart-heading">
            <div>
              <h3>Stars 随采样时间变化</h3>
              <p>
                横轴是快照采样时间，纵轴是仓库 star 总数；速度值由窗口内首尾快照计算。
              </p>
            </div>
            <span>{timeAgo(firstSnapshot)} - {timeAgo(latestSnapshot)}</span>
          </div>
          <StarTimeChart points={history} />
        </div>

        <div className="detail-grid">
          <section>
            <h3>仓库状态</h3>
            <div className="detail-list">
              <div><span>当前 stars</span><strong>{formatFullNumber(repo.stars)}</strong></div>
              <div><span>窗口</span><strong>{formatWindow(windowHours)}</strong></div>
              <div><span>星速</span><strong>{repo.coldStart ? "待复测" : `${formatVelocity(repo.starsPerHour)}/h`}</strong></div>
              <div><span>最后 push</span><strong>{timeAgo(repo.pushedAt)}</strong></div>
              <div><span>快照</span><strong>{timeAgo(latestSnapshot)}</strong></div>
              <div><span>Forks</span><strong>{formatNumber(repo.forks)}</strong></div>
              <div><span>Issues</span><strong>{formatNumber(repo.openIssues)}</strong></div>
              <div><span>数据生成</span><strong>{formatGeneratedAt(generatedAt)}</strong></div>
            </div>
          </section>
          <section>
            <h3>Topics</h3>
            <div className="topics">
              {topics.length ? topics.map((topic) => <span key={topic}>{topic}</span>) : <span>暂无 topic</span>}
            </div>
          </section>
          <section>
            <h3>机会信号</h3>
            <div className="signal-chips">
              {(repo.monetizationSignals || []).map((signal) => <span key={`m-${signal}`}>变现：{signal}</span>)}
              {(repo.cloneabilitySignals || []).map((signal) => <span key={`c-${signal}`}>复用：{signal}</span>)}
              {(repo.reviewSignals || []).map((signal) => <span className="review" key={`r-${signal.type}`}>{signal.label}</span>)}
              {!repo.monetizationSignals?.length && !repo.cloneabilitySignals?.length && !repo.reviewSignals?.length && <span>暂无额外信号</span>}
            </div>
          </section>
        </div>

        <section className="snapshot-table">
          <h3>快照明细</h3>
          <div>
            <table>
              <thead>
                <tr>
                  <th>采样时间</th>
                  <th>Stars</th>
                </tr>
              </thead>
              <tbody>
                {history.map((point) => (
                  <tr key={point.capturedAt}>
                    <td>{timeAgo(point.capturedAt)}</td>
                    <td>{formatFullNumber(point.stars)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </div>
  );
}

function Spotlight({ repo, windowHours }) {
  if (!repo) return null;

  return (
    <section className="spotlight" aria-label="当前榜首项目">
      <div className="spotlight-copy">
        <span className="section-kicker">
          <Radio size={16} />
          当前榜首
        </span>
        <a className="spotlight-title" href={repo.url} target="_blank" rel="noreferrer">
          {repo.fullName}
          <ArrowUpRight size={18} />
        </a>
        <p>{repo.description || "这个仓库暂时没有描述。"}</p>
        <div className="spotlight-tags">
          <span>{repo.language || "Unknown"}</span>
          <span>{formatWindow(windowHours)}窗口</span>
          {repo.opportunityTier && <span>{repo.opportunityTier}</span>}
          {Number.isFinite(Number(repo.confidenceScore)) && <span>{confidenceLabel(repo.confidenceScore)}</span>}
          {(repo.opportunityTags || []).slice(0, 3).map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
          <span>{repo.coldStart ? "待复测" : "真实快照"}</span>
        </div>
      </div>
      <div className="spotlight-score">
        <span>{repo.opportunityTier || "Opportunity score"}</span>
        <strong>{formatScore(repo.opportunityScore)}</strong>
        <small>发现分 {formatScore(repo.discoveryScore)} · 置信度 {formatScore(repo.confidenceScore)}</small>
      </div>
    </section>
  );
}

function TodayWorthResearch({ items, onAddResearch, onAnalyze, onIgnore, queuedIds }) {
  return (
    <section className="today-panel" aria-label="今日值得研究">
      <div className="today-header">
        <div>
          <span className="section-kicker">
            <ListChecks size={16} />
            Today Worth Research
          </span>
          <h2>今日值得研究</h2>
        </div>
        <strong>{items.length} repos</strong>
      </div>
      {items.length ? (
        <div className="today-grid">
          {items.map((repo) => {
            const isQueued = queuedIds.has(repoStorageId(repo));
            return (
              <article className="today-card" key={repo.id}>
                <a href={repo.url} target="_blank" rel="noreferrer">
                  {repo.fullName}
                  <ArrowUpRight size={14} />
                </a>
                <p>{repo.whyNow?.[0] || repo.opportunityReasons?.[0] || "值得花 10 分钟快速研究。"}</p>
                <div className="today-metrics">
                  <span>{repo.opportunityTier || "机会"}</span>
                  <span>机会 {formatScore(repo.opportunityScore)}</span>
                  <span>发现 {formatScore(repo.discoveryScore)}</span>
                  <span>{confidenceLabel(repo.confidenceScore)}</span>
                </div>
                <div className="today-actions">
                  <button onClick={() => onAddResearch(repo)} disabled={isQueued}>
                    <BookmarkPlus size={15} />
                    {isQueued ? "已在队列" : "加入队列"}
                  </button>
                  <button onClick={() => onAnalyze(repo)}>
                    <Copy size={15} />
                    分析
                  </button>
                  <button onClick={() => onIgnore(repo)}>
                    <EyeOff size={15} />
                    忽略
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="empty today-empty">今天没有新的高置信 S/A 级候选，先处理研究队列或换个分组看看。</div>
      )}
    </section>
  );
}

function PersonalRepoList({ type, entries, repoMap, onRemoveResearch, onRestoreIgnored, onAnalyze, onOpen }) {
  if (!entries.length) {
    return (
      <div className="empty personal-empty">
        {type === "research" ? "研究队列还是空的。看到值得研究的项目时点“加入研究队列”。" : "还没有忽略项目。"}
      </div>
    );
  }

  return (
    <div className="personal-list">
      {entries.map(({ entry, repo }) => {
        const title = repo?.fullName || entry.fullName || entry.repoId;
        const date = entry.addedAt || entry.ignoredAt;
        return (
          <article className="personal-row" key={repoStorageId(entry)}>
            <div className="personal-main">
              {repo?.url ? (
                <a href={repo.url} target="_blank" rel="noreferrer">
                  {title}
                  <ArrowUpRight size={14} />
                </a>
              ) : (
                <strong>{title}</strong>
              )}
              <p>{repo?.description || (type === "research" ? "这个项目暂时不在当前数据窗口内，保留在队列中待后续复查。" : "已从榜单隐藏，可随时恢复。")}</p>
              <div className="opportunity-tags">
                {(repo?.opportunityTags || []).slice(0, 4).map((tag) => (
                  <span key={tag} className={isReviewTag(tag) ? "review" : ""}>
                    {tag}
                  </span>
                ))}
              </div>
            </div>
            <div className="personal-meta">
              <span>{type === "research" ? "加入时间" : "忽略时间"}</span>
              <strong>{timeAgo(date)}</strong>
              <small>机会 {formatScore(repo?.opportunityScore ?? entry.opportunityScore)}</small>
              <small>发现 {formatScore(repo?.discoveryScore ?? entry.discoveryScore)}</small>
              <small>{confidenceLabel(repo?.confidenceScore ?? entry.confidenceScore)} {formatScore(repo?.confidenceScore ?? entry.confidenceScore)}</small>
            </div>
            <div className="personal-actions">
              {repo && (
                <button onClick={() => onOpen(repo)}>
                  <BarChart3 size={15} />
                  详情
                </button>
              )}
              {repo?.url && (
                <button onClick={() => onAnalyze(repo)}>
                  <Copy size={15} />
                  分析
                </button>
              )}
              {type === "research" ? (
                <button className="danger" onClick={() => onRemoveResearch(entry.repoId)}>
                  <Trash2 size={15} />
                  移除
                </button>
              ) : (
                <button onClick={() => onRestoreIgnored(entry.repoId)}>
                  <RotateCcw size={15} />
                  恢复
                </button>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function PersonalInsights({ insights }) {
  return (
    <section className="insight-panel">
      <div className="panel-title">
        <ListChecks size={17} />
        <h2>Personal Insights</h2>
      </div>
      <div className="personal-insights">
        <div>
          <strong>最常收藏标签</strong>
          <div className="topic-cloud">
            {insights.researchTags.length ? insights.researchTags.map(([tag, count]) => (
              <span key={tag}>
                {tag}
                <b>{count}</b>
              </span>
            )) : <span>暂无收藏行为</span>}
          </div>
        </div>
        <div>
          <strong>最常忽略标签</strong>
          <div className="topic-cloud">
            {insights.ignoredTags.length ? insights.ignoredTags.map(([tag, count]) => (
              <span key={tag}>
                {tag}
                <b>{count}</b>
              </span>
            )) : <span>暂无忽略行为</span>}
          </div>
        </div>
      </div>
    </section>
  );
}

function Toast({ toast }) {
  if (!toast) return null;
  return <div className={`toast ${toast.type || ""}`}>{toast.message}</div>;
}

function InsightsPanel({ items, languages, generatedAt, sourceData, refresh, personalInsights }) {
  const topLanguages = languages.slice(0, 8);
  const hotTopics = useMemo(() => {
    const counts = new Map();
    items.forEach((repo) => {
      (repo.topics || []).forEach((topic) => {
        counts.set(topic, (counts.get(topic) || 0) + 1);
      });
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
  }, [items]);

  return (
    <aside className="insights" aria-label="机会洞察">
      <section className="insight-panel">
        <div className="panel-title">
          <Sparkles size={17} />
          <h2>机会切片</h2>
        </div>
        <div className="signal-list">
          <div>
            <strong>{sourceData?.minStars || refresh?.minStars || 1000}+</strong>
            <span>发现池门槛</span>
          </div>
          <div>
            <strong>{refresh?.candidates || items.length}</strong>
            <span>候选仓库</span>
          </div>
          <div>
            <strong>{formatGeneratedAt(generatedAt)}</strong>
            <span>最近生成</span>
          </div>
        </div>
      </section>

      <section className="insight-panel">
        <div className="panel-title">
          <Code2 size={17} />
          <h2>语言热度</h2>
        </div>
        <div className="language-rank">
          {topLanguages.map((item) => (
            <div key={item.language}>
              <span>{item.language}</span>
              <div>
                <i style={{ width: `${Math.max(10, Math.min(100, item.count * 3))}%` }} />
              </div>
              <strong>{item.count}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="insight-panel">
        <div className="panel-title">
          <BarChart3 size={17} />
          <h2>高频 Topic</h2>
        </div>
        <div className="topic-cloud">
          {hotTopics.map(([topic, count]) => (
            <span key={topic}>
              {topic}
              <b>{count}</b>
            </span>
          ))}
        </div>
      </section>

      <PersonalInsights insights={personalInsights} />
    </aside>
  );
}

export default function TrendApp({ initialData = null }) {
  const isStaticMode = import.meta.env.PROD || import.meta.env.PUBLIC_STATIC_MODE === "true";
  const [group, setGroup] = useState("watch");
  const [windowHours, setWindowHours] = useState(24);
  const [mode, setMode] = useState("opportunity");
  const [activeView, setActiveView] = useState("opportunity");
  const [language, setLanguage] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [refreshTick, setRefreshTick] = useState(0);
  const [selectedRepo, setSelectedRepo] = useState(null);
  const [toast, setToast] = useState(null);
  const [ignoredRepos, setIgnoredRepos] = useStoredRepoList(ignoredStorageKey);
  const [researchQueue, setResearchQueue] = useStoredRepoList(researchQueueStorageKey);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setRefreshTick((tick) => tick + 1);
    }, autoRefreshMs);

    return () => window.clearInterval(timer);
  }, []);

  const trendingPath = `/api/trending?group=${encodeURIComponent(group)}&windowHours=${windowHours}&mode=${encodeURIComponent(mode)}&language=${encodeURIComponent(language)}&limit=80&t=${refreshTick}`;
  const staticTrending = useStaticTrending(refreshTick, initialData);
  const apiTrending = useApi(trendingPath, [group, windowHours, mode, language, refreshTick], !isStaticMode);
  const apiGroups = useApi("/api/groups", [refreshTick], !isStaticMode);
  const apiLanguages = useApi(`/api/languages?group=${encodeURIComponent(group)}`, [group, refreshTick], !isStaticMode);
  const groups = apiGroups.data?.items || staticTrending.data?.groups || [{ id: "watch", name: "全部关注" }, { id: "global", name: "综合" }];
  const staticWindow = staticTrending.data?.groupWindows?.[group]?.[String(windowHours)] || (group === "watch" ? staticTrending.data?.windows?.[String(windowHours)] : null);
  const apiWindow = apiTrending.data || null;
  const sourceData = isStaticMode ? staticWindow : apiWindow || staticWindow || apiTrending.data;
  const sourceLabel = isStaticMode || !apiWindow ? "静态快照" : "实时 API";
  const loading = isStaticMode ? staticTrending.loading : staticTrending.loading && apiTrending.loading;
  const error = isStaticMode ? staticTrending.error : staticTrending.error && apiTrending.error ? staticTrending.error : "";
  const languages = apiLanguages.data?.items || staticTrending.data?.groupLanguages?.[group] || (group === "watch" ? staticTrending.data?.languages : []) || [];
  const generatedAt = sourceData?.generatedAt || staticTrending.data?.generatedAt;
  const refresh = staticTrending.data?.refresh;
  const rankingModes = sourceData?.rankingModes || staticTrending.data?.rankingModes || defaultRankingModes;
  const rawSourceItems = getRankingItems(sourceData, mode);
  const allCurrentRepos = useMemo(() => getAllRankingRepos(sourceData), [sourceData]);
  const repoMap = useMemo(() => createRepoMap(allCurrentRepos), [allCurrentRepos]);
  const ignoredIds = useMemo(() => new Set(ignoredRepos.map((repo) => repoStorageId(repo))), [ignoredRepos]);
  const queuedIds = useMemo(() => new Set(researchQueue.map((repo) => repoStorageId(repo))), [researchQueue]);
  const sourceItems = useMemo(() => rawSourceItems.filter((repo) => !ignoredIds.has(repoStorageId(repo))), [rawSourceItems, ignoredIds]);

  const showToast = (message, type = "success") => {
    setToast({ message, type, id: Date.now() });
  };

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const handleAnalyzeRepo = async (repo) => {
    if (!repo?.url) {
      showToast("当前数据缺少仓库 URL，无法复制分析 Prompt", "error");
      return;
    }
    try {
      await copyText(buildAnalysisPrompt(repo));
      showToast("已复制分析 Prompt");
    } catch {
      showToast("复制失败，请手动复制", "error");
    }
  };

  const handleAddResearch = (repo) => {
    const repoId = repoStorageId(repo);
    setResearchQueue((current) => {
      if (current.some((item) => repoStorageId(item) === repoId)) return current;
      return [
        {
          repoId: repo.id,
          fullName: repo.fullName,
          addedAt: new Date().toISOString(),
          opportunityScore: repo.opportunityScore,
          discoveryScore: repo.discoveryScore,
          confidenceScore: repo.confidenceScore
        },
        ...current
      ];
    });
    showToast("已加入研究队列");
  };

  const handleRemoveResearch = (repoId) => {
    const key = String(repoId);
    setResearchQueue((current) => current.filter((item) => repoStorageId(item) !== key));
    showToast("已从研究队列移除");
  };

  const handleIgnoreRepo = (repo) => {
    const repoId = repoStorageId(repo);
    setIgnoredRepos((current) => {
      if (current.some((item) => repoStorageId(item) === repoId)) return current;
      return [
        {
          repoId: repo.id,
          fullName: repo.fullName,
          ignoredAt: new Date().toISOString()
        },
        ...current
      ];
    });
    if (selectedRepo && repoStorageId(selectedRepo) === repoId) setSelectedRepo(null);
    showToast("已忽略该仓库");
  };

  const handleRestoreIgnored = (repoId) => {
    const key = String(repoId);
    setIgnoredRepos((current) => current.filter((item) => repoStorageId(item) !== key));
    showToast("已恢复显示");
  };

  const items = useMemo(() => {
    const repos = sourceItems;
    const byLanguage = language ? repos.filter((repo) => repo.language?.toLowerCase() === language.toLowerCase()) : repos;
    if (!query.trim()) return byLanguage;
    const needle = query.trim().toLowerCase();
    return byLanguage.filter((repo) => {
      return (
        repo.fullName.toLowerCase().includes(needle) ||
        (repo.description || "").toLowerCase().includes(needle) ||
        (repo.topics || []).some((topic) => topic.toLowerCase().includes(needle))
      );
    });
  }, [sourceItems, language, query]);

  const researchEntries = useMemo(() => {
    return researchQueue
      .map((entry) => ({ entry, repo: repoMap.get(repoStorageId(entry)) }))
      .filter(({ entry, repo }) => entryMatchesFilters(entry, repo, language, query))
      .sort((a, b) => new Date(b.entry.addedAt || 0) - new Date(a.entry.addedAt || 0));
  }, [researchQueue, repoMap, language, query]);

  const ignoredEntries = useMemo(() => {
    return ignoredRepos
      .map((entry) => ({ entry, repo: repoMap.get(repoStorageId(entry)) }))
      .filter(({ entry, repo }) => entryMatchesFilters(entry, repo, language, query))
      .sort((a, b) => new Date(b.entry.ignoredAt || 0) - new Date(a.entry.ignoredAt || 0));
  }, [ignoredRepos, repoMap, language, query]);

  const todayItems = useMemo(() => {
    return getRankingItems(sourceData, "opportunity")
      .filter((repo) => {
        const repoId = repoStorageId(repo);
        return (
          (repo.opportunityTier === "S级机会" || repo.opportunityTier === "A级机会") &&
          Number(repo.confidenceScore) >= 60 &&
          !ignoredIds.has(repoId) &&
          !queuedIds.has(repoId) &&
          (!language || repo.language?.toLowerCase() === language.toLowerCase())
        );
      })
      .sort((a, b) => (b.opportunityScore || 0) - (a.opportunityScore || 0))
      .slice(0, 10);
  }, [sourceData, language, ignoredIds, queuedIds]);

  const personalInsights = useMemo(() => ({
    researchTags: countTags(researchQueue, repoMap),
    ignoredTags: countTags(ignoredRepos, repoMap)
  }), [researchQueue, ignoredRepos, repoMap]);

  useEffect(() => {
    setPage(1);
  }, [group, windowHours, mode, activeView, language, query, researchQueue.length, ignoredRepos.length]);

  useEffect(() => {
    setLanguage("");
  }, [group]);

  useEffect(() => {
    if (!selectedRepo) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") setSelectedRepo(null);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedRepo]);

  const isResearchView = activeView === "research";
  const isIgnoredView = activeView === "ignored";
  const isPersonalView = isResearchView || isIgnoredView;
  const personalEntries = isResearchView ? researchEntries : ignoredEntries;
  const listCount = isPersonalView ? personalEntries.length : items.length;
  const pageCount = Math.max(1, Math.ceil(listCount / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageStart = listCount ? (currentPage - 1) * pageSize : 0;
  const pageEnd = Math.min(pageStart + pageSize, listCount);
  const pageItems = isPersonalView ? personalEntries.slice(pageStart, pageEnd) : items.slice(pageStart, pageEnd);
  const listEyebrow = isResearchView ? "Research Queue" : isIgnoredView ? "Ignored Repositories" : "Opportunity Repositories";
  const listTitle = isResearchView ? "待研究项目队列" : isIgnoredView ? "已忽略项目" : "值得研究的开源项目机会";

  const totals = useMemo(() => {
    const repos = sourceItems;
    const visibleRepos = language ? repos.filter((repo) => repo.language?.toLowerCase() === language.toLowerCase()) : repos;
    const observed = visibleRepos.filter((repo) => !repo.coldStart).length;
    const top = visibleRepos[0];
    const topObserved = visibleRepos.find((repo) => !repo.coldStart);
    const totalStars = visibleRepos.reduce((sum, repo) => sum + (repo.stars || 0), 0);
    const averageOpportunity = visibleRepos.length
      ? Math.round(visibleRepos.reduce((sum, repo) => sum + (repo.opportunityScore || 0), 0) / visibleRepos.length)
      : 0;
    return {
      count: visibleRepos.length,
      observed,
      averageOpportunity,
      topVelocity: topObserved ? `${formatVelocity(topObserved.starsPerHour)}/h` : "待复测",
      topDelta: top ? `+${top.starDelta}` : "+0",
      totalStars: formatNumber(totalStars)
    };
  }, [sourceItems, language]);

  return (
    <>
      <section className="signal-bar" aria-label="数据状态">
        <div>
          <BadgeCheck size={18} />
          <span>100+ stars 发现池，保留 1000+ 热门基线</span>
        </div>
        <div>
          <RefreshCw size={18} />
          <span>机会评分综合增长、复用、变现、AI 与可疑信号</span>
        </div>
        <div>
          <GitBranch size={18} />
          <span>GitHub Actions 自动生成数据</span>
        </div>
      </section>

      <Spotlight repo={items[0]} windowHours={windowHours} />

      <section className="stats" aria-label="机会统计">
        <Stat icon={Code2} label="机会项目" value={totals.count} hint={`${totals.observed} 个真实快照`} tone="tone-blue" />
        <Stat icon={Sparkles} label="平均机会分" value={totals.averageOpportunity} hint="当前榜单" tone="tone-gold" />
        <Stat icon={Star} label="榜首增量" value={totals.topDelta} hint="窗口内新增" tone="tone-green" />
        <Stat icon={Zap} label="最高星速" value={totals.topVelocity} hint={formatWindow(windowHours)} tone="tone-purple" />
        <Stat icon={ShieldCheck} label="数据更新" value={formatGeneratedAt(generatedAt)} hint="静态快照" tone="tone-gray" />
      </section>

      <TodayWorthResearch
        items={todayItems}
        onAddResearch={handleAddResearch}
        onAnalyze={handleAnalyzeRepo}
        onIgnore={handleIgnoreRepo}
        queuedIds={queuedIds}
      />

      <section className="group-tabs" aria-label="选择监控分组">
        {groups.map((item) => (
          <button key={item.id} className={group === item.id ? "active" : ""} onClick={() => setGroup(item.id)} title={item.description || item.name}>
            {item.name}
          </button>
        ))}
      </section>

      <section className="toolbar" aria-label="筛选和搜索">
        <div className="mode-tabs" role="group" aria-label="选择榜单模式">
          {rankingModes.map((item) => (
            <button
              key={item.id}
              className={activeView === item.id ? "active" : ""}
              onClick={() => {
                setMode(item.id);
                setActiveView(item.id);
              }}
            >
              {item.name}
            </button>
          ))}
          {personalTabs.map((item) => (
            <button
              key={item.id}
              className={activeView === item.id ? "active personal-tab" : "personal-tab"}
              onClick={() => setActiveView(item.id)}
            >
              {item.name}
              {item.id === "research" ? ` ${researchQueue.length}` : ` ${ignoredRepos.length}`}
            </button>
          ))}
        </div>
        <div className="search">
          <Search size={18} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索仓库、描述或 topic" />
        </div>
        <div className="segments" role="group" aria-label="选择时间窗口">
          {windows.map((item) => (
            <button
              key={item.value}
              className={windowHours === item.value ? "active" : ""}
              onClick={() => setWindowHours(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <label className="language-filter">
          <Filter size={17} />
          <select value={language} onChange={(event) => setLanguage(event.target.value)} aria-label="选择语言">
            <option value="">全部语言</option>
            {languages.map((item) => (
              <option key={item.language} value={item.language}>
                {item.language} ({item.count})
              </option>
            ))}
          </select>
        </label>
      </section>

      {error && (
        <div className="alert">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      <div className="workspace">
        <section className="list-shell" aria-label="开源项目机会列表">
          <div className="list-header">
            <div>
              <span>{listEyebrow}</span>
              <h2>{listTitle}</h2>
            </div>
            <strong>{listCount ? `${pageStart + 1}-${pageEnd} / ${listCount}` : "0 repos"}</strong>
          </div>
          <div className="list">
            {loading && Array.from({ length: 6 }).map((_, index) => <div className="skeleton" key={index} />)}
            {!loading && !isPersonalView && pageItems.map((repo, index) => (
              <RepoRow
                repo={repo}
                rank={pageStart + index + 1}
                key={repo.id}
                onOpen={setSelectedRepo}
                onAddResearch={handleAddResearch}
                onAnalyze={handleAnalyzeRepo}
                onIgnore={handleIgnoreRepo}
                isQueued={queuedIds.has(repoStorageId(repo))}
              />
            ))}
            {!loading && isPersonalView && (
              <PersonalRepoList
                type={isResearchView ? "research" : "ignored"}
                entries={pageItems}
                repoMap={repoMap}
                onRemoveResearch={handleRemoveResearch}
                onRestoreIgnored={handleRestoreIgnored}
                onAnalyze={handleAnalyzeRepo}
                onOpen={setSelectedRepo}
              />
            )}
            {!loading && !listCount && !isPersonalView && <div className="empty">这个榜单暂时没有匹配的仓库。换个时间窗口、语言或榜单试试。</div>}
          </div>
          {!loading && listCount > pageSize && (
            <nav className="pagination" aria-label="Repository pagination">
              <button disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
                Prev
              </button>
              <span>
                Page {currentPage} / {pageCount}
              </span>
              <button disabled={currentPage === pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>
                Next
              </button>
            </nav>
          )}
        </section>

        <InsightsPanel items={items} languages={languages} generatedAt={generatedAt} sourceData={sourceData} refresh={refresh} personalInsights={personalInsights} />
      </div>

      <RepoDetailModal
        repo={selectedRepo}
        windowHours={windowHours}
        generatedAt={generatedAt}
        sourceLabel={sourceLabel}
        onClose={() => setSelectedRepo(null)}
        onAddResearch={handleAddResearch}
        onAnalyze={handleAnalyzeRepo}
        onIgnore={handleIgnoreRepo}
        isQueued={selectedRepo ? queuedIds.has(repoStorageId(selectedRepo)) : false}
      />
      <Toast toast={toast} />
    </>
  );
}
