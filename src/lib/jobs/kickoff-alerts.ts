import {
  alreadyPushed,
  getMatchesBetween,
  makeRankLookup,
  markPushed,
  matchRowToFd,
} from "../db";
import { sendDiscord } from "../messaging/discord";
import { kickoffAlert, type TonightExtra } from "../messaging/format";
import { DEFAULT_CONFIG, scoreMatch, type ScoringConfig } from "../score";
import { fetchTeamForm } from "./team-form";

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

function fmtTimeShort(iso: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
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
 * 推荐 scheduler 每 10 分钟跑一次，lookaheadMin 设 60。
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
  const lookup = makeRankLookup();
  const items = upcoming
    .map((r) => scoreMatch(matchRowToFd(r), lookup, cfg))
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
      // 拉双方近 5 场战绩（4h SQLite 缓存兜底；按 teamId 存以便 format 端按 left/right 取）
      const homeId = it.match.homeTeam.id;
      const awayId = it.match.awayTeam.id;
      const [homeForm, awayForm] = await Promise.all([
        fetchTeamForm(homeId),
        fetchTeamForm(awayId),
      ]);
      const formByTeam = new Map<number, string | null>([
        [homeId, homeForm],
        [awayId, awayForm],
      ]);

      // 「今晚还有 N 场」：当地日期内的剩余 worth match（不含这场）
      const dayWindow = localDayUtcWindow(it.match.utcDate);
      const dayRows = getMatchesBetween(dayWindow.from, dayWindow.to);
      const dayItems = dayRows
        .filter(
          (r) => r.status === "SCHEDULED" || r.status === "TIMED",
        )
        .map((r) => scoreMatch(matchRowToFd(r), lookup, cfg))
        .filter((i) => i.worthWatching);
      const remaining = dayItems
        .filter(
          (x) =>
            x.match.id !== it.match.id &&
            new Date(x.match.utcDate).getTime() >
              new Date(it.match.utcDate).getTime(),
        )
        .sort((a, b) => a.match.utcDate.localeCompare(b.match.utcDate));
      const tonight: TonightExtra = {
        remainingCount: remaining.length,
        nextKickoffTime:
          remaining.length > 0 ? fmtTimeShort(remaining[0].match.utcDate) : null,
      };

      await sendDiscord(
        kickoffAlert(it, minutesUntil, { formByTeam, tonight }),
      );
      markPushed("kickoff", it.match.id, k);
      pushed++;
    } catch (e) {
      console.warn(`[kickoff] push failed for match ${it.match.id}:`, e);
    }
  }

  return { scanned: items.length, pushed, skipped };
}
