import {
  alreadyPushed,
  getMatchesBetween,
  getRankByTeamId,
  markPushed,
  matchRowToFd,
} from "../db";
import { sendDiscord } from "../messaging/discord";
import { weeklyPreview } from "../messaging/format";
import { DEFAULT_CONFIG, scoreMatch, type ScoringConfig } from "../score";

const TZ = process.env.TZ || "Europe/Berlin";

function localDateKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: TZ,
  }).format(d);
}

function localLabel(d: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    weekday: "short",
    month: "numeric",
    day: "numeric",
    timeZone: TZ,
  }).format(d);
}

export interface WeeklyPreviewResult {
  weekStart: string;
  totalDays: number;
  totalWorth: number;
  pushed: boolean;
  reason?: string;
}

/**
 * 默认在周六早上 08:00 推一次：包括周六、周日两天的"值得看"比赛。
 * 也接受 daysFromNow 参数自定义起止：
 *   - daysFromNow=0  从今天起
 *   - days=2         往后 2 天（即周六 + 周日）
 */
export async function runWeeklyPreview(opts: {
  daysFromNow?: number;
  days?: number;
  cfg?: ScoringConfig;
  force?: boolean;
} = {}): Promise<WeeklyPreviewResult> {
  const cfg = opts.cfg ?? DEFAULT_CONFIG;
  const startOffset = opts.daysFromNow ?? 0;
  const days = opts.days ?? 2;

  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() + startOffset);
  const startKey = localDateKey(startDate);

  if (!opts.force && alreadyPushed("weekly", 0, startKey)) {
    return {
      weekStart: startKey,
      totalDays: days,
      totalWorth: 0,
      pushed: false,
      reason: "已推过",
    };
  }

  const rankByTeam = getRankByTeamId();
  const groups: { dateLabel: string; items: ReturnType<typeof scoreMatch>[] }[] =
    [];
  let totalWorth = 0;
  for (let i = 0; i < days; i++) {
    const dayStart = new Date(startDate);
    dayStart.setDate(dayStart.getDate() + i);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const fromLocal = new Date(`${localDateKey(dayStart)}T00:00:00`);
    const toLocal = new Date(`${localDateKey(dayEnd)}T00:00:00`);

    const rows = getMatchesBetween(fromLocal.toISOString(), toLocal.toISOString());
    const items = rows
      .map((r) => scoreMatch(matchRowToFd(r), rankByTeam, cfg))
      .filter((i) => i.worthWatching)
      .sort((a, b) => a.match.utcDate.localeCompare(b.match.utcDate));

    totalWorth += items.length;
    groups.push({ dateLabel: localLabel(dayStart), items });
  }

  const weekLabel = `${localLabel(startDate)} 起 ${days} 天`;
  await sendDiscord(weeklyPreview(weekLabel, groups));
  markPushed("weekly", 0, startKey);

  return { weekStart: startKey, totalDays: days, totalWorth, pushed: true };
}
