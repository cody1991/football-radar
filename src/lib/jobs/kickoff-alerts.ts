import {
  alreadyPushed,
  getMatchesBetween,
  makeRankLookup,
  markPushed,
  matchRowToFd,
} from "../db";
import { sendDiscord } from "../messaging/discord";
import { kickoffAlert } from "../messaging/format";
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

  let pushed = 0;
  let skipped = 0;
  for (const it of items) {
    const k = dateKey(it.match.utcDate);
    if (!dryRun && alreadyPushed("kickoff", it.match.id, k)) {
      skipped++;
      continue;
    }
    const minutesUntil = Math.max(
      1,
      Math.round((new Date(it.match.utcDate).getTime() - now) / 60000),
    );
    try {
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

      await sendDiscord(
        kickoffAlert(it, minutesUntil, { sequence }),
        { competitionCode: it.match.competition.code },
      );
      if (!dryRun) markPushed("kickoff", it.match.id, k);
      pushed++;
    } catch (e) {
      console.warn(`[kickoff] push failed for match ${it.match.id}:`, e);
    }
  }

  return { scanned: items.length, pushed, skipped, dryRun };
}
