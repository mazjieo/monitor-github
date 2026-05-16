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
  Star,
  Zap
} from "lucide-react";

const windows = [
  { label: "6h", value: 6 },
  { label: "24h", value: 24 },
  { label: "3d", value: 72 },
  { label: "7d", value: 168 }
];
const autoRefreshMs = 5 * 60 * 1000;

const numberFmt = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const dateFmt = new Intl.DateTimeFormat("zh-CN", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit"
});

function formatNumber(value) {
  return numberFmt.format(value || 0);
}

function formatVelocity(value) {
  if (value >= 10) return value.toFixed(1);
  if (value >= 1) return value.toFixed(2);
  return value.toFixed(3);
}

function timeAgo(value) {
  if (!value) return "暂无";
  const seconds = Math.max(0, (Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return "刚刚";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时前`;
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
  return repo.language || "Open Source";
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

function Stat({ icon: Icon, label, value, tone = "" }) {
  return (
    <div className={`stat ${tone}`}>
      <Icon size={17} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function RepoRow({ repo, rank }) {
  const topics = repo.topics?.slice(0, 5) || [];

  return (
    <article className="repo-row">
      <div className="rank" aria-label={`第 ${rank} 名`}>{rank}</div>
      <div className="repo-main">
        <div className="repo-heading">
          <a href={repo.url} target="_blank" rel="noreferrer">
            <span>{repo.fullName}</span>
            <ArrowUpRight size={15} />
          </a>
          <span className="language">{repo.language || "Unknown"}</span>
          <span className="domain">{getRepoDomain(repo)}</span>
        </div>
        <p>{repo.description || "这个仓库暂时没有描述。"}</p>
        <div className="topics">
          {topics.map((topic) => (
            <span key={topic}>{topic}</span>
          ))}
        </div>
      </div>
      <div className="repo-metrics">
        <div className="velocity">
          <Zap size={18} />
          <strong>{formatVelocity(repo.starsPerHour)}</strong>
          <span>stars/h</span>
        </div>
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
          <span>{timeAgo(repo.pushedAt)}</span>
        </div>
        {repo.coldStart ? <span className="cold-start">估算趋势</span> : <span className="delta">+{repo.starDelta} stars</span>}
      </div>
    </article>
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
        <strong>{formatVelocity(repo.starsPerHour)}</strong>
        <small>stars / hour</small>
      </div>
    </section>
  );
}

export default function TrendApp({ initialData = null }) {
  const [windowHours, setWindowHours] = useState(24);
  const [language, setLanguage] = useState("");
  const [query, setQuery] = useState("");
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setRefreshTick((tick) => tick + 1);
    }, autoRefreshMs);

    return () => window.clearInterval(timer);
  }, []);

  const trendingPath = `/api/trending?windowHours=${windowHours}&language=${encodeURIComponent(language)}&limit=80&t=${refreshTick}`;
  const staticTrending = useStaticTrending(refreshTick, initialData);
  const apiTrending = useApi(trendingPath, [windowHours, language, refreshTick]);
  const apiLanguages = useApi("/api/languages", [refreshTick]);
  const staticWindow = staticTrending.data?.windows?.[String(windowHours)];
  const sourceData = staticWindow || apiTrending.data;
  const loading = staticTrending.loading && apiTrending.loading;
  const error = staticTrending.error && apiTrending.error ? staticTrending.error : "";
  const languages = staticTrending.data?.languages || apiLanguages.data?.items || [];
  const generatedAt = staticTrending.data?.generatedAt || sourceData?.generatedAt;

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

  const totals = useMemo(() => {
    const repos = sourceData?.items || [];
    const visibleRepos = language ? repos.filter((repo) => repo.language?.toLowerCase() === language.toLowerCase()) : repos;
    const observed = visibleRepos.filter((repo) => !repo.coldStart).length;
    const top = visibleRepos[0];
    const totalStars = visibleRepos.reduce((sum, repo) => sum + (repo.stars || 0), 0);
    return {
      count: visibleRepos.length,
      observed,
      topVelocity: top ? formatVelocity(top.starsPerHour) : "0",
      topDelta: top ? `+${top.starDelta}` : "+0",
      totalStars: formatNumber(totalStars)
    };
  }, [sourceData, language]);

  return (
    <>
      <section className="signal-bar" aria-label="数据状态">
        <div>
          <BadgeCheck size={18} />
          <span>只扫描 500 stars 以上仓库</span>
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

      <section className="toolbar" aria-label="筛选和搜索">
        <div className="search">
          <Search size={18} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索仓库、描述或 topic" />
        </div>
        <div className="segments">
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

      <section className="stats" aria-label="趋势统计">
        <Stat icon={Code2} label="候选项目" value={totals.count} tone="tone-blue" />
        <Stat icon={Zap} label="最高星速" value={`${totals.topVelocity}/h`} tone="tone-gold" />
        <Stat icon={Star} label="榜首增量" value={totals.topDelta} tone="tone-green" />
        <Stat icon={BarChart3} label="总星标量" value={totals.totalStars} tone="tone-purple" />
        <Stat icon={Clock3} label="数据更新" value={formatGeneratedAt(generatedAt)} tone="tone-gray" />
      </section>

      {error && (
        <div className="alert">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      <section className="list" aria-label="GitHub 升星项目列表">
        {loading && Array.from({ length: 6 }).map((_, index) => <div className="skeleton" key={index} />)}
        {!loading && items.map((repo, index) => <RepoRow repo={repo} rank={index + 1} key={repo.id} />)}
        {!loading && !items.length && <div className="empty">还没有匹配的仓库。等待 GitHub Actions 生成第一批数据。</div>}
      </section>
    </>
  );
}
