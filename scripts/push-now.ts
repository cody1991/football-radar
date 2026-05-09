import { runKickoffAlerts } from "../src/lib/jobs/kickoff-alerts";
import { runMorningDigest } from "../src/lib/jobs/morning-digest";
import { refreshData } from "../src/lib/jobs/refresh-data";
import { runWeeklyPreview } from "../src/lib/jobs/weekly-preview";

const HELP = `
Usage: npm run push:now -- <command>

Commands:
  refresh             立即拉一次远程数据写入 SQLite
  morning             立即推一条今日早报（默认带去重；--force 强制再推）
  kickoff             立即扫一次即将开赛的比赛
  weekly              立即推一条本周末预告
  all                 refresh -> morning(force) -> weekly(force)（用于 Discord webhook 自检）

Flags:
  --force             忽略 push_log 去重（morning / weekly / kickoff 都支持）
`;

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const force = argv.includes("--force");
  if (!cmd || cmd === "--help" || cmd === "-h") {
    console.log(HELP.trim());
    process.exit(0);
  }
  switch (cmd) {
    case "refresh": {
      const r = await refreshData();
      console.log("refresh:", r);
      break;
    }
    case "morning": {
      const r = await runMorningDigest({ force });
      console.log("morning:", r);
      break;
    }
    case "kickoff": {
      if (force) {
        // 临时清掉 kickoff push_log，让本次扫描全部重推
        const { db } = await import("../src/lib/db");
        const n = db().prepare(`DELETE FROM push_log WHERE job = 'kickoff'`).run().changes;
        console.log(`(--force) cleared ${n} kickoff push_log entries`);
      }
      const r = await runKickoffAlerts({ lookaheadMin: 60 });
      console.log("kickoff:", r);
      break;
    }
    case "weekly": {
      const r = await runWeeklyPreview({ force });
      console.log("weekly:", r);
      break;
    }
    case "all": {
      console.log(await refreshData());
      console.log(await runMorningDigest({ force: true }));
      console.log(await runWeeklyPreview({ force: true }));
      break;
    }
    default:
      console.error(`unknown command: ${cmd}`);
      console.log(HELP.trim());
      process.exit(2);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack : e);
  process.exit(1);
});
