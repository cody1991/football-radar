/**
 * 一次性 tick 入口，给 GitHub Actions cron 用。
 *
 * 每次执行：
 *  1) 当 last_refresh 距今 > 6 小时 → 拉一次远程数据（refresh）
 *  2) 当 Amsterdam(本地) 时间在 08:00–08:09 之间 → 推今日早报
 *  3) 当本地是周六 08:00–08:09 → 推周末预告
 *  4) 永远跑一次 kickoff 扫描（lookahead=60min，留余量给 GH cron 抖动）
 *
 * push_log 表负责去重，不会因为 09:00 又跑一次就重复推早报。
 */

import { closeDb, getMeta } from "../src/lib/db";
import { runKickoffAlerts } from "../src/lib/jobs/kickoff-alerts";
import { runMorningDigest } from "../src/lib/jobs/morning-digest";
import { refreshData } from "../src/lib/jobs/refresh-data";
import { runWeeklyPreview } from "../src/lib/jobs/weekly-preview";

const TZ = process.env.TZ || "Europe/Amsterdam";

interface TzNow {
  date: string;
  hour: number;
  minute: number;
  weekday: number; // 0=Sun..6=Sat
}

function nowInTz(): TzNow {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    hour12: false,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = fmt.formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const wkd: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    weekday: wkd[get("weekday")] ?? -1,
  };
}

async function safe<T>(name: string, fn: () => Promise<T>): Promise<void> {
  console.log(`▶ ${name}`);
  try {
    const r = await fn();
    console.log(`✔ ${name}:`, r);
  } catch (e) {
    console.error(`✖ ${name}:`, e instanceof Error ? e.message : e);
    process.exitCode = 1; // 仍然完成其它步骤；但作业整体标记失败便于发现
  }
}

async function main() {
  const t = nowInTz();
  const stamp = `${t.date} ${String(t.hour).padStart(2, "0")}:${String(t.minute).padStart(2, "0")}`;
  console.log(`tick @ ${stamp} ${TZ} (wkd=${t.weekday})`);

  // 1) refresh：距上次 >6h 才拉，每天大约 4 次
  const last = getMeta("last_refresh_at");
  const ageH = last ? (Date.now() - Number(last.value)) / 3600000 : Infinity;
  if (ageH > 6) {
    await safe("refresh", () => refreshData());
  } else {
    console.log(`⏭ refresh skipped (last refresh ${ageH.toFixed(1)}h ago)`);
  }

  // 2) morning digest：08:00–08:09 窗口
  if (t.hour === 8 && t.minute < 10) {
    await safe("morning", () => runMorningDigest());
  }

  // 3) weekly preview：周六 08:00–08:09
  if (t.weekday === 6 && t.hour === 8 && t.minute < 10) {
    await safe("weekly", () => runWeeklyPreview());
  }

  // 4) kickoff scan：永远跑。lookahead=60min 留 50min 余量给 GH cron 抖动
  await safe("kickoff", () => runKickoffAlerts({ lookaheadMin: 60 }));

  // 把 WAL 合并到主 db，便于干净地 git commit
  closeDb();
}

main().catch((e) => {
  console.error(e);
  closeDb();
  process.exit(1);
});
