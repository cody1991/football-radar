import { getTeamForm, setTeamForm } from "../db";
import { getTeamRecentMatches, matchesToForm } from "../football-data";

const FORM_TTL_MS = 4 * 60 * 60 * 1000; // 4 小时；近 5 场战绩短期不会变

/**
 * 拿一支球队最近 5 场战绩 W/D/L 字符串，最近场在最前。
 * 优先读 SQLite 缓存（4 小时 TTL）；过期才去打 football-data。
 * 拉失败时返回 null（不影响主流程）。
 */
export async function fetchTeamForm(teamId: number): Promise<string | null> {
  const cached = getTeamForm(teamId, FORM_TTL_MS);
  if (cached != null) return cached;
  try {
    const matches = await getTeamRecentMatches(teamId, 5);
    const form = matchesToForm(teamId, matches);
    setTeamForm(teamId, form);
    return form;
  } catch (e) {
    console.warn(`[form] fetch failed for team ${teamId}:`, e);
    return null;
  }
}
