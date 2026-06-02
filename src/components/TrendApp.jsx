import React, { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowUpRight,
  BadgeCheck,
  BarChart3,
  Clock3,
  Code2,
  Filter,
  GitBranch,
  GitFork,
  Radio,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  X,
  Zap
} from "lucide-react";

const windows = [
  { label: "6h", value: 6 },
  { label: "24h", value: 24 },
  { label: "3d", value: 72 },
  { label: "7d", value: 168 }
];
const pageSize = 10;
const autoRefreshMs = 5 * 60 * 1000;

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

function useApi(path, deps) {
  const [state, setState] = useState({ data: null, loading: true, error: "" });

  useEffect(() => {
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
  }, deps);

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

function RepoRow({ repo, rank, onOpen }) {
  const topics = repo.topics?.slice(0, 4) || [];
  const domain = getRepoDomain(repo);
  const latestSnapshot = repo.lastSeen || repo.starHistory?.[repo.starHistory.length - 1]?.capturedAt;

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
      </div>

      <div className="repo-score">
        <div>
          <span>velocity</span>
          <strong>{repoVelocityLabel(repo)}</strong>
          <small>{repoVelocityUnit(repo)}</small>
        </div>
        <button className="detail-button" onClick={() => onOpen(repo)}>
          <BarChart3 size={16} />
          详情
        </button>
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

function RepoDetailModal({ repo, windowHours, generatedAt, sourceLabel, onClose }) {
  if (!repo) return null;

  const history = [...(repo.starHistory || [])].sort((a, b) => new Date(a.capturedAt) - new Date(b.capturedAt));
  const latestSnapshot = repo.lastSeen || history[history.length - 1]?.capturedAt;
  const firstSnapshot = repo.firstSeen || history[0]?.capturedAt;
  const topics = repo.topics || [];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="repo-modal" role="dialog" aria-modal="true" aria-label={`${repo.fullName} 趋势详情`} onClick={(event) => event.stopPropagation()}>
        <header className="modal-header">
          <div>
            <span className="section-kicker">
              <BarChart3 size={16} />
              趋势详情
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
            <span>窗口</span>
            <strong>{formatWindow(windowHours)}</strong>
          </div>
          <div>
            <span>星速</span>
            <strong>{repo.coldStart ? "待复测" : `${formatVelocity(repo.starsPerHour)}/h`}</strong>
          </div>
          <div>
            <span>窗口增量</span>
            <strong>+{repo.starDelta}</strong>
          </div>
          <div>
            <span>快照数</span>
            <strong>{repo.snapshotCount || history.length}</strong>
          </div>
          <div>
            <span>当前 stars</span>
            <strong>{formatFullNumber(repo.stars)}</strong>
          </div>
          <div>
            <span>数据源</span>
            <strong>{sourceLabel}</strong>
          </div>
        </div>

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
          <span>{repo.coldStart ? "估算趋势" : "真实快照"}</span>
        </div>
      </div>
      <div className="spotlight-score">
        <span>Star velocity</span>
        <strong>{repoVelocityLabel(repo)}</strong>
        <small>{repoVelocityUnit(repo)}</small>
      </div>
    </section>
  );
}

function InsightsPanel({ items, languages, generatedAt, sourceData, refresh }) {
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
    <aside className="insights" aria-label="趋势洞察">
      <section className="insight-panel">
        <div className="panel-title">
          <Sparkles size={17} />
          <h2>趋势切片</h2>
        </div>
        <div className="signal-list">
          <div>
            <strong>{sourceData?.minStars || refresh?.minStars || 1000}+</strong>
            <span>最低星标门槛</span>
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
    </aside>
  );
}

export default function TrendApp({ initialData = null }) {
  const [group, setGroup] = useState("watch");
  const [windowHours, setWindowHours] = useState(24);
  const [language, setLanguage] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [refreshTick, setRefreshTick] = useState(0);
  const [selectedRepo, setSelectedRepo] = useState(null);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setRefreshTick((tick) => tick + 1);
    }, autoRefreshMs);

    return () => window.clearInterval(timer);
  }, []);

  const trendingPath = `/api/trending?group=${encodeURIComponent(group)}&windowHours=${windowHours}&language=${encodeURIComponent(language)}&limit=80&t=${refreshTick}`;
  const staticTrending = useStaticTrending(refreshTick, initialData);
  const apiTrending = useApi(trendingPath, [group, windowHours, language, refreshTick]);
  const apiGroups = useApi("/api/groups", [refreshTick]);
  const apiLanguages = useApi(`/api/languages?group=${encodeURIComponent(group)}`, [group, refreshTick]);
  const groups = apiGroups.data?.items || staticTrending.data?.groups || [{ id: "watch", name: "全部关注" }, { id: "global", name: "综合" }];
  const staticWindow = staticTrending.data?.groupWindows?.[group]?.[String(windowHours)] || (group === "watch" ? staticTrending.data?.windows?.[String(windowHours)] : null);
  const apiWindow = apiTrending.data || null;
  const sourceData = apiWindow || staticWindow || apiTrending.data;
  const sourceLabel = apiWindow ? "实时 API" : "静态快照";
  const loading = staticTrending.loading && apiTrending.loading;
  const error = staticTrending.error && apiTrending.error ? staticTrending.error : "";
  const languages = apiLanguages.data?.items || staticTrending.data?.groupLanguages?.[group] || (group === "watch" ? staticTrending.data?.languages : []) || [];
  const generatedAt = sourceData?.generatedAt || staticTrending.data?.generatedAt;
  const refresh = staticTrending.data?.refresh;

  const items = useMemo(() => {
    const repos = sourceData?.items || [];
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
  }, [sourceData, language, query]);

  useEffect(() => {
    setPage(1);
  }, [group, windowHours, language, query]);

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

  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageStart = items.length ? (currentPage - 1) * pageSize : 0;
  const pageEnd = Math.min(pageStart + pageSize, items.length);
  const pageItems = items.slice(pageStart, pageEnd);

  const totals = useMemo(() => {
    const repos = sourceData?.items || [];
    const visibleRepos = language ? repos.filter((repo) => repo.language?.toLowerCase() === language.toLowerCase()) : repos;
    const observed = visibleRepos.filter((repo) => !repo.coldStart).length;
    const top = visibleRepos[0];
    const topObserved = visibleRepos.find((repo) => !repo.coldStart);
    const totalStars = visibleRepos.reduce((sum, repo) => sum + (repo.stars || 0), 0);
    return {
      count: visibleRepos.length,
      observed,
      topVelocity: topObserved ? `${formatVelocity(topObserved.starsPerHour)}/h` : "待复测",
      topDelta: top ? `+${top.starDelta}` : "+0",
      totalStars: formatNumber(totalStars)
    };
  }, [sourceData, language]);

  return (
    <>
      <section className="signal-bar" aria-label="数据状态">
        <div>
          <BadgeCheck size={18} />
          <span>多策略候选池，1000+ stars 起采样</span>
        </div>
        <div>
          <RefreshCw size={18} />
          <span>每 5 分钟检测静态数据更新</span>
        </div>
        <div>
          <GitBranch size={18} />
          <span>GitHub Actions 自动生成数据</span>
        </div>
      </section>

      <Spotlight repo={items[0]} windowHours={windowHours} />

      <section className="stats" aria-label="趋势统计">
        <Stat icon={Code2} label="候选项目" value={totals.count} hint={`${totals.observed} 个真实快照`} tone="tone-blue" />
        <Stat icon={Zap} label="最高星速" value={totals.topVelocity} hint={formatWindow(windowHours)} tone="tone-gold" />
        <Stat icon={Star} label="榜首增量" value={totals.topDelta} hint="窗口内新增" tone="tone-green" />
        <Stat icon={BarChart3} label="总星标量" value={totals.totalStars} hint="当前筛选合集" tone="tone-purple" />
        <Stat icon={ShieldCheck} label="数据更新" value={formatGeneratedAt(generatedAt)} hint="静态快照" tone="tone-gray" />
      </section>

      <section className="group-tabs" aria-label="选择监控分组">
        {groups.map((item) => (
          <button key={item.id} className={group === item.id ? "active" : ""} onClick={() => setGroup(item.id)} title={item.description || item.name}>
            {item.name}
          </button>
        ))}
      </section>

      <section className="toolbar" aria-label="筛选和搜索">
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
        <section className="list-shell" aria-label="GitHub 升星项目列表">
          <div className="list-header">
            <div>
              <span>Trending Repositories</span>
              <h2>正在加速的开源项目</h2>
            </div>
            <strong>{items.length ? `${pageStart + 1}-${pageEnd} / ${items.length}` : "0 repos"}</strong>
          </div>
          <div className="list">
            {loading && Array.from({ length: 6 }).map((_, index) => <div className="skeleton" key={index} />)}
            {!loading && pageItems.map((repo, index) => <RepoRow repo={repo} rank={pageStart + index + 1} key={repo.id} onOpen={setSelectedRepo} />)}
            {!loading && !items.length && <div className="empty">还没有匹配的仓库。换个时间窗口或语言试试。</div>}
          </div>
          {!loading && items.length > pageSize && (
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

        <InsightsPanel items={items} languages={languages} generatedAt={generatedAt} sourceData={sourceData} refresh={refresh} />
      </div>

      <RepoDetailModal repo={selectedRepo} windowHours={windowHours} generatedAt={generatedAt} sourceLabel={sourceLabel} onClose={() => setSelectedRepo(null)} />
    </>
  );
}
