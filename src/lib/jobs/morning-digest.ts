import {
  alreadyPushed,
  getMatchesBetween,
  makeRankLookup,
  markPushed,
  matchRowToFd,
} from "../db";
import { sendDiscord } from "../messaging/discord";
import { morningDigest } from "../messaging/format";
import { DEFAULT_CONFIG, scoreMatch, type ScoringConfig } from "../score";

const TZ = process.env.TZ || "Europe/Berlin";

function localDateKey(d: Date = new Date()): string {
  // YYYY-MM-DD in configured TZ
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: TZ,
  }).format(d);
}

/** 计算 [今天 00:00, 明天 00:00) 的 UTC ISO 区间。 */
function todayUtcWindow(): { from: string; to: string } {
  const now = new Date();
  const today = localDateKey(now);
  const tomorrow = localDateKey(new Date(now.getTime() + 24 * 3600 * 1000));
  // 取本地零点 -> UTC ISO
  const fromLocal = new Date(`${today}T00:00:00`);
  const toLocal = new Date(`${tomorrow}T00:00:00`);
  return { from: fromLocal.toISOString(), to: toLocal.toISOString() };
}

export interface MorningDigestResult {
  date: string;
  total: number;
  worth: number;
  pushed: boolean;
  reason?: string;
}

export async function runMorningDigest(opts: {
  cfg?: ScoringConfig;
  force?: boolean;
} = {}): Promise<MorningDigestResult> {
  const cfg = opts.cfg ?? DEFAULT_CONFIG;
  const dateKey = localDateKey();

  if (!opts.force && alreadyPushed("morning", 0, dateKey)) {
    return { date: dateKey, total: 0, worth: 0, pushed: false, reason: "已推过" };
  }

  const { from, to } = todayUtcWindow();
  const rows = getMatchesBetween(from, to);
  const lookup = makeRankLookup();
  // 早报按时间升序，符合"今日时间表"心智模型
  const items = rows
    .map((r) => scoreMatch(matchRowToFd(r), lookup, cfg))
    .sort((a, b) => a.match.utcDate.localeCompare(b.match.utcDate));

  const worth = items.filter((i) => i.worthWatching).length;

  const msg = morningDigest(dateKey, items);
  await sendDiscord(msg);
  markPushed("morning", 0, dateKey);

  return { date: dateKey, total: items.length, worth, pushed: true };
}
