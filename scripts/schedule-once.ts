/**
 * 一次性 tick 入口，给 GitHub Actions cron 用。
 *
 * 每次执行：
 *  1) 当 last_refresh 距今 > 6 小时 → 拉一次远程数据（refresh）
 *  2) 永远跑一次 kickoff 扫描（lookahead=60min，留余量给 GH cron 抖动）
 *
 * 早报 / 周末预告已下线；想临时跑还是可以 `npm run push:now -- morning --force`。
 */

import { closeDb, getMeta } from "../src/lib/db";
import { runKickoffAlerts } from "../src/lib/jobs/kickoff-alerts";
import { refreshData } from "../src/lib/jobs/refresh-data";

const TZ = process.env.TZ || "Europe/Amsterdam";

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
  console.log(`tick @ ${new Date().toISOString()} TZ=${TZ}`);

  // 1) refresh：距上次 >6h 才拉，每天大约 4 次
  const last = getMeta("last_refresh_at");
  const ageH = last ? (Date.now() - Number(last.value)) / 3600000 : Infinity;
  if (ageH > 6) {
    await safe("refresh", () => refreshData());
  } else {
    console.log(`⏭ refresh skipped (last refresh ${ageH.toFixed(1)}h ago)`);
  }

  // 2) kickoff scan：永远跑。lookahead=60min 留余量给 GH cron 抖动
  await safe("kickoff", () => runKickoffAlerts({ lookaheadMin: 60 }));

  // 把 WAL 合并到主 db，便于干净地 git commit
  closeDb();
}

main().catch((e) => {
  console.error(e);
  closeDb();
  process.exit(1);
});
