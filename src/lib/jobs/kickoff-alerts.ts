import {
  alreadyPushed,
  getMatchesBetween,
  makeRankLookup,
  markPushed,
  matchRowToFd,
} from "../db";
import { sendDiscord } from "../messaging/discord";
import { imminentPing, kickoffAlert } from "../messaging/format";
import { DEFAULT_CONFIG, scoreMatch, type ScoringConfig } from "../score";

const TZ = process.env.TZ || "Europe/Berlin";

function dateKey(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: TZ,
  }).format(new Date(iso));
}

function localDayUtcWindow(iso: string): { from: string; to: string } {
  const today = dateKey(iso);
  const tomorrow = dateKey(
    new Date(new Date(iso).getTime() + 24 * 3600 * 1000).toISOString(),
  );
  return {
    from: new Date(`${today}T00:00:00`).toISOString(),
    to: new Date(`${tomorrow}T00:00:00`).toISOString(),
  };
}

export interface KickoffAlertResult {
  scanned: number;
  pushed: number;
  skipped: number;
  dryRun: boolean;
}

/**
 * 扫一次：在 (now, now + lookaheadMin] 内开赛的「值得看」比赛全部推一次。
 * 用 push_log 去重（job=kickoff, match_id=match.id, date=本地日期）。
 *
 * 推荐 scheduler 每 10 分钟跑一次，lookaheadMin 设 60。
 *
 * `dryRun=true` 时：跳过 push_log 读写，每次都把所有命中比赛推一遍 Discord，
 *                 完全不影响线上去重状态。用于本地测试消息样式。
 */
export async function runKickoffAlerts(opts: {
  lookaheadMin?: number;
  cfg?: ScoringConfig;
  dryRun?: boolean;
} = {}): Promise<KickoffAlertResult> {
  const lookahead = opts.lookaheadMin ?? 30;
  const cfg = opts.cfg ?? DEFAULT_CONFIG;
  const dryRun = opts.dryRun ?? false;
  const now = Date.now();
  const fromIso = new Date(now).toISOString();
  const toIso = new Date(now + lookahead * 60 * 1000).toISOString();

  const rows = getMatchesBetween(fromIso, toIso);
  // 仅未开始的
  const upcoming = rows.filter(
    (r) => r.status === "SCHEDULED" || r.status === "TIMED",
  );
  const lookup = makeRankLookup();
  const items = upcoming
    .map((r) => scoreMatch(matchRowToFd(r), lookup, cfg))
    .filter((i) => i.worthWatching);

  // 临开赛 ping 阈值：≤ 这么多分钟就额外发一条 @here 简短提醒。
  // 跟 cron 间隔（10min）对齐，保证每场比赛在窗口内必有一次 tick 落进去。
  // 设小于 cron 间隔会有概率被错过（cron 节奏 :00/:10/:20，小于 10min 窗口可能完全跳过）。
  const IMMINENT_MIN = 10;

  let pushed = 0;
  let skipped = 0;
  for (const it of items) {
    const k = dateKey(it.match.utcDate);
    const competitionCode = it.match.competition.code;
    const minutesUntil = Math.max(
      1,
      Math.round((new Date(it.match.utcDate).getTime() - now) / 60000),
    );

    // 「第 N/M 场」：算同一本地日内全部 worth 比赛（仅未开始的）
    const dayWindow = localDayUtcWindow(it.match.utcDate);
    const dayRows = getMatchesBetween(dayWindow.from, dayWindow.to);
    const dayItems = dayRows
      .filter((r) => r.status === "SCHEDULED" || r.status === "TIMED")
      .map((r) => scoreMatch(matchRowToFd(r), lookup, cfg))
      .filter((i) => i.worthWatching)
      .sort((a, b) => a.match.utcDate.localeCompare(b.match.utcDate));
    const myIndex = dayItems.findIndex((x) => x.match.id === it.match.id);
    const sequence =
      myIndex >= 0
        ? { index: myIndex + 1, total: dayItems.length }
        : undefined;

    let didSomething = false;

    // ── Phase 1: 完整 alert（开赛前 0–60min 任意时刻首次扫到）──
    const alertPushed = !dryRun && alreadyPushed("kickoff", it.match.id, k);
    if (!alertPushed) {
      try {
        await sendDiscord(
          kickoffAlert(it, minutesUntil, { sequence }),
          { competitionCode },
        );
        if (!dryRun) markPushed("kickoff", it.match.id, k);
        didSomething = true;
      } catch (e) {
        console.warn(`[kickoff] push failed for match ${it.match.id}:`, e);
      }
    }

    // ── Phase 2: 临开赛 ping（开赛前 ≤ 5min，独立去重）──
    if (minutesUntil <= IMMINENT_MIN) {
      const pingPushed =
        !dryRun && alreadyPushed("kickoff-imminent", it.match.id, k);
      if (!pingPushed) {
        try {
          await sendDiscord(imminentPing(it, minutesUntil), {
            competitionCode,
          });
          if (!dryRun) markPushed("kickoff-imminent", it.match.id, k);
          didSomething = true;
        } catch (e) {
          console.warn(
            `[kickoff-imminent] push failed for match ${it.match.id}:`,
            e,
          );
        }
      }
    }

    if (didSomething) pushed++;
    else skipped++;
  }

  return { scanned: items.length, pushed, skipped, dryRun };
}
