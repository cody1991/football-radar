import { runKickoffAlerts } from "../src/lib/jobs/kickoff-alerts";
import { runMorningDigest } from "../src/lib/jobs/morning-digest";
import { refreshData } from "../src/lib/jobs/refresh-data";
import { runWeeklyPreview } from "../src/lib/jobs/weekly-preview";
import { sendDiscord } from "../src/lib/messaging/discord";

const HELP = `
Usage: npm run push:now -- <command> [flags]

Commands:
  refresh             立即拉一次远程数据写入 SQLite
  morning             立即推一条今日早报（默认带去重；--force 强制再推）
  kickoff             立即扫一次即将开赛的比赛
  weekly              立即推一条本周末预告
  all                 refresh -> morning(force) -> weekly(force)（用于 Discord webhook 自检）
  test-channel        给一组频道各发一条测试消息，验证 webhook 是否配置正确
                      用法：npm run push:now -- test-channel WC EC CLI
                      不传参数默认测试 EC 和 CLI（最近新加的两个）

Flags:
  --force             忽略 push_log 去重（morning / weekly / kickoff 都支持）
  --dry-run           仅 kickoff：不读不写 push_log，每次都推一遍。
                      用于本地测试消息样式，绝不污染线上去重状态。
  --lookahead=<min>   仅 kickoff：覆盖默认 60min lookahead，比如 --lookahead=300
                      可以把今晚后续几场都推一遍看效果。
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
      const dryRun = argv.includes("--dry-run");
      const lookaheadArg = argv.find((a) => a.startsWith("--lookahead="));
      const lookaheadMin = lookaheadArg
        ? Number(lookaheadArg.split("=")[1])
        : 60;
      if (force && !dryRun) {
        // 临时清掉 kickoff push_log，让本次扫描全部重推（dry-run 自己就跳过 push_log，无需清）
        const { db } = await import("../src/lib/db");
        const n = db()
          .prepare(`DELETE FROM push_log WHERE job = 'kickoff'`)
          .run().changes;
        console.log(`(--force) cleared ${n} kickoff push_log entries`);
      }
      const r = await runKickoffAlerts({ lookaheadMin, dryRun });
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
    case "test-channel": {
      const codes = argv.slice(1).filter((a) => !a.startsWith("--"));
      const targets = codes.length > 0 ? codes : ["EC", "CLI"];
      const labels: Record<string, string> = {
        WC: "🏆 世界杯频道",
        EC: "🇪🇺 欧洲杯频道",
        CLI: "🌎 解放者杯频道",
      };
      for (const code of targets) {
        const label = labels[code] ?? `${code} 频道`;
        try {
          await sendDiscord(
            {
              content: `✅ **${label} 连接测试** — 如果你看到这条消息，说明 \`DISCORD_WEBHOOK_URL_${code}\` 配置正确，将来 ${code} 比赛会推到这里。`,
            },
            { competitionCode: code },
          );
          console.log(`[test-channel] ${code}: ok`);
        } catch (e) {
          console.error(
            `[test-channel] ${code}: FAILED →`,
            e instanceof Error ? e.message : e,
          );
        }
      }
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
