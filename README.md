# Football Radar

按球队排名 + 传统德比筛选"值得看"的足球比赛，每天早 8 点 / 开赛前 30 分钟 / 周末把重头戏推到 Discord。

数据源：[football-data.org](https://www.football-data.org/) v4 API（个人免费档）。
本地存储：SQLite（`./data/football-radar.db`）。
运行形态：两个 Node 进程 — Next.js 看板（web）+ node-cron 调度器（scheduler），共享 SQLite。

```
┌────────── scheduler (node-cron) ──────────┐
│ 07:30 daily   refresh: 拉 7 天赛程 + 排名│
│ 08:00 daily   今日早报 → Discord          │
│ */10 min      开赛前 30 min 提醒 → Discord│
│ 周六 08:05    周末预告 → Discord           │
└────┬──────────────────────────────────────┘
     ↓ 写
┌──────────── SQLite (data/) ────────────┐
│ matches / standings / push_log / meta  │
└────┬───────────────────────────────────┘
     ↑ 读
┌──────────── Next.js web 看板 ──────────┐
│ http://<host>:3000                      │
│ 始终秒响应（不依赖外部 API 健康度）      │
└────────────────────────────────────────┘
```

## 1. 快速本地启动

```bash
# 装依赖
npm install

# 配置环境（编辑 .env.local 填两个 token）
cp .env.example .env.local
#   FOOTBALL_DATA_TOKEN  → https://www.football-data.org/client/register 注册免费拿
#   DISCORD_WEBHOOK_URL  → Discord 频道 → 编辑频道 → 集成 → Webhooks → 新建

# 第一次先拉一次数据进 SQLite
npm run push:now -- refresh

# 起 web 看板
npm run dev
# 浏览器打开 http://localhost:3000
```

想跑常驻调度器：

```bash
# 另开一个终端
npm run scheduler
```

scheduler 启动时会自动 (a) refresh 一次数据 (b) 如果当天还没推早报就推一条；之后按 cron 表自己运行。

## 2. CLI 工具：手动触发某个 job

```bash
npm run push:now -- refresh         # 拉一次数据
npm run push:now -- morning         # 推一条今日早报（已推过会跳过）
npm run push:now -- morning --force # 强制再推一次
npm run push:now -- weekly          # 推一条周末预告
npm run push:now -- weekly --force
npm run push:now -- kickoff         # 立刻扫一次即将开赛
npm run push:now -- all             # refresh + morning(force) + weekly(force) 一条龙自检
```

## 3. Docker 部署（推荐生产用法）

服务器上把代码 clone 下来，写好 `.env.local`，然后：

```bash
# 构建镜像 + 起两个容器（web + scheduler）
docker compose up -d --build

# 查看日志
docker compose logs -f scheduler   # 看调度执行
docker compose logs -f web         # 看 web 访问

# 停止 / 更新
docker compose pull && docker compose up -d --build
docker compose down
```

容器布局：
- `football-radar-web`        : 监听 `:3000`，Next.js 看板
- `football-radar-scheduler` : 常驻 node-cron
- 共享卷                       : `./data/`（SQLite 文件）
- 时区                         : 由 compose 的 `TZ` 决定，默认 `Europe/Berlin`，需要的话在 `.env.local` 里设

数据持久化：删容器不会丢，因为 `./data/` 是宿主目录挂载。

## 4. 配置 / 自定义

| 想改什么 | 改哪里 |
|---|---|
| Top N 阈值 / 任一方 vs 双方 | `src/lib/score.ts` 的 `DEFAULT_CONFIG` |
| 关注哪些联赛 | `src/lib/competitions.ts` 的 `available` 字段 |
| 传统德比清单 | `src/lib/derbies.ts` |
| 含金量评分公式 | `src/lib/score.ts` 的 `scoreMatch` |
| 早报 / 周报 / 开赛提醒消息样式 | `src/lib/messaging/format.ts` |
| 调度时间表 | `scripts/scheduler.ts` |
| 数据库路径 | `FOOTBALL_RADAR_DB` 环境变量 |

## 5. 含金量评分（透明可调）

```
总分 =
  (21 - 主队排名)             # 第 1 名得 20，第 20 名得 1，未上榜得 0
+ (21 - 客队排名)
+ (双方都在 Top N ? 30 : 一方在 Top N ? 10 : 0)
+ (是传统德比 ? 25 : 0)
+ (欧冠 ? 8 : 0)
```

排序按总分 desc。要换权重直接改 `scoreMatch`。

## 6. 关键文件地图

```
football-radar/
├── docker-compose.yml          # 一键起 web + scheduler
├── Dockerfile                  # 通用镜像
├── .env.example                # 环境变量模板
├── data/                       # SQLite 数据目录（mount）
├── scripts/
│   ├── scheduler.ts            # node-cron 入口（常驻进程）
│   └── push-now.ts             # CLI（手动触发某 job）
└── src/
    ├── app/
    │   ├── page.tsx            # 看板（client component）
    │   └── api/matches/route.ts# 从 SQLite 读 + 打分排序
    ├── components/MatchCard.tsx
    └── lib/
        ├── football-data.ts    # API client（含自适应限流）
        ├── db.ts               # SQLite schema + 读写封装
        ├── competitions.ts     # 联赛元数据
        ├── derbies.ts          # 德比清单
        ├── score.ts            # 含金量评分
        ├── types.ts
        ├── messaging/
        │   ├── discord.ts      # webhook 客户端
        │   └── format.ts       # 早报/开赛/周报消息模板
        └── jobs/
            ├── refresh-data.ts
            ├── morning-digest.ts
            ├── kickoff-alerts.ts
            └── weekly-preview.ts
```

## 7. API 用量预估

football-data.org 个人免费档：**10 req/min**。本项目实际消耗：

| 时机 | 消耗 |
|---|---|
| 每天 07:30 refresh | 6 standings + 1 matches = **7 次** |
| scheduler bootstrap | 同上 |
| kickoff 扫描 | 0（只读 SQLite） |
| morning / weekly | 0（只读 SQLite） |
| web 访问 | 0（只读 SQLite） |

**一天合计：约 7~14 次远程调用**，远远在限额内。

## 8. 已知限制 & 后续方向

- **欧联（Europa League）** 免费档不含；代码已预留位，升级 Tier One 或接第二数据源后可启用
- **per-competition 排名**：当前同一支球队跨联赛/欧冠时排名混合显示。可后续按 `match.competition` 区分
- **比分实时推送**：进球/半场/终场推送当前未做，可加一个高频 job + status 对比
- **持久化用户配置**：当前 web 看板的筛选不会写回 scheduler，scheduler 用 `DEFAULT_CONFIG`。可加一个 admin 页/`config` 表
```
