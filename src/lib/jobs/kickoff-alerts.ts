import {
  alreadyPushed,
  getMatchesBetween,
  getRankByTeamId,
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

export interface KickoffAlertResult {
  scanned: number;
  pushed: number;
  skipped: number;
}

/**
 * 扫一次：在 (now, now + lookaheadMin] 内开赛的「值得看」比赛全部推一次。
 * 用 push_log 去重（job=kickoff, match_id=match.id, date=本地日期）。
 *
 * 推荐 scheduler 每 10 分钟跑一次，lookaheadMin 设 30。
 * 这样每场比赛大概率会在开赛前 20–30 分钟收到提醒。
 */
export async function runKickoffAlerts(opts: {
  lookaheadMin?: number;
  cfg?: ScoringConfig;
} = {}): Promise<KickoffAlertResult> {
  const lookahead = opts.lookaheadMin ?? 30;
  const cfg = opts.cfg ?? DEFAULT_CONFIG;
  const now = Date.now();
  const fromIso = new Date(now).toISOString();
  const toIso = new Date(now + lookahead * 60 * 1000).toISOString();

  const rows = getMatchesBetween(fromIso, toIso);
  // 仅未开始的
  const upcoming = rows.filter(
    (r) => r.status === "SCHEDULED" || r.status === "TIMED",
  );
  const rankByTeam = getRankByTeamId();
  const items = upcoming
    .map((r) => scoreMatch(matchRowToFd(r), rankByTeam, cfg))
    .filter((i) => i.worthWatching);

  let pushed = 0;
  let skipped = 0;
  for (const it of items) {
    const k = dateKey(it.match.utcDate);
    if (alreadyPushed("kickoff", it.match.id, k)) {
      skipped++;
      continue;
    }
    const minutesUntil = Math.max(
      1,
      Math.round((new Date(it.match.utcDate).getTime() - now) / 60000),
    );
    try {
      await sendDiscord(kickoffAlert(it, minutesUntil));
      markPushed("kickoff", it.match.id, k);
      pushed++;
    } catch (e) {
      console.warn(`[kickoff] push failed for match ${it.match.id}:`, e);
    }
  }

  return { scanned: items.length, pushed, skipped };
}
