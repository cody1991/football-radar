import cron from "node-cron";
import { runKickoffAlerts } from "../src/lib/jobs/kickoff-alerts";
import { refreshData } from "../src/lib/jobs/refresh-data";

const TZ = process.env.TZ || "Europe/Berlin";

function ts() {
  return new Date().toISOString();
}

function log(...args: unknown[]) {
  console.log(`[${ts()}]`, ...args);
}

async function safe<T>(name: string, fn: () => Promise<T>): Promise<void> {
  log(`▶ ${name} start`);
  try {
    const r = await fn();
    log(`✔ ${name} done`, r);
  } catch (e) {
    log(`✖ ${name} failed:`, e instanceof Error ? e.message : e);
  }
}

async function bootstrap() {
  log(`scheduler boot · TZ=${TZ}`);

  // 启动时先做一次刷新，确保 SQLite 有数据
  await safe("bootstrap.refresh", () => refreshData());

  // 每天 07:30 拉一次数据
  cron.schedule(
    "30 7 * * *",
    () => safe("daily.refresh", () => refreshData()),
    { timezone: TZ },
  );

  // 每 10 分钟扫即将开赛的重点比赛（核心功能）
  cron.schedule(
    "*/10 * * * *",
    () => safe("kickoff.scan", () => runKickoffAlerts({ lookaheadMin: 30 })),
    { timezone: TZ },
  );

  log("schedule registered (kickoff alert only). Awaiting cron triggers...");
}

bootstrap().catch((e) => {
  console.error("bootstrap failed:", e);
  process.exit(1);
});

// 优雅退出
function shutdown(sig: string) {
  log(`received ${sig}, exiting`);
  process.exit(0);
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
