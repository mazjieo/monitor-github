# GitHub Star Radar

一个用于监测 GitHub 上升星速度最快项目的轻量全栈应用。

## 功能

- 定时抓取 GitHub Search API 中近期活跃且有一定星标量的仓库
- 保存每个仓库的星标快照，用观察窗口内的星标增量计算 `stars/hour`
- 首次运行没有历史快照时，使用“创建以来平均星速”作为冷启动排序
- 提供语言筛选、关键词搜索、观察窗口切换和手动刷新

## 运行

```bash
npm install
npm run dev
```

前端地址：`http://127.0.0.1:5173`

后端地址：`http://127.0.0.1:4317`

## 配置

复制 `.env.example` 为 `.env` 后可配置：

```bash
GITHUB_TOKEN=ghp_xxx
REFRESH_CRON=*/30 * * * *
SNAPSHOT_WINDOW_HOURS=24
```

建议配置 `GITHUB_TOKEN`，未配置时 GitHub API 匿名额度较低。

## 常用命令

```bash
npm run refresh
npm run build
npm start
```
