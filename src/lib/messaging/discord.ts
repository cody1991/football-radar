// Discord Webhook 客户端。最多每条消息 2000 字符，多嵌入(embed)走 embeds[]。
//
// 支持按比赛类型路由到不同 webhook：
//   - DISCORD_WEBHOOK_URL          默认（联赛 / 欧冠 / 早报 / 周报）
//   - DISCORD_WEBHOOK_URL_WC       世界杯专用频道
//   - DISCORD_WEBHOOK_URL_EC       欧洲杯专用频道
//   - DISCORD_WEBHOOK_URL_CLI      南美解放者杯专用频道（多在欧洲深夜，建议频道开静音）
// 缺失某个特殊 webhook 时回退到 DISCORD_WEBHOOK_URL。

function pickWebhook(competitionCode?: string): string | undefined {
  if (competitionCode === "WC") {
    return process.env.DISCORD_WEBHOOK_URL_WC || process.env.DISCORD_WEBHOOK_URL;
  }
  if (competitionCode === "EC") {
    return process.env.DISCORD_WEBHOOK_URL_EC || process.env.DISCORD_WEBHOOK_URL;
  }
  if (competitionCode === "CLI") {
    return process.env.DISCORD_WEBHOOK_URL_CLI || process.env.DISCORD_WEBHOOK_URL;
  }
  return process.env.DISCORD_WEBHOOK_URL;
}

export interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface DiscordEmbed {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  timestamp?: string;
  author?: { name: string; url?: string; icon_url?: string };
  footer?: { text: string; icon_url?: string };
  fields?: DiscordEmbedField[];
  thumbnail?: { url: string };
  image?: { url: string };
}

export interface DiscordMessage {
  username?: string;
  avatar_url?: string;
  content?: string;
  embeds?: DiscordEmbed[];
  /**
   * 控制 @everyone / @here / role / user 提醒是否真的触发铃。
   * 默认 Discord 会解析 content 中的 @here / @everyone，但有时被频道设置或代理拦截，
   * 显式 parse 后行为更稳。
   */
  allowed_mentions?: {
    parse?: Array<"roles" | "users" | "everyone">;
    roles?: string[];
    users?: string[];
  };
}

export interface SendDiscordOptions {
  /** 比赛 competition code，用于路由到对应 webhook（WC → 世界杯频道，EC → 欧洲杯频道） */
  competitionCode?: string;
}

export async function sendDiscord(
  msg: DiscordMessage,
  opts: SendDiscordOptions = {},
): Promise<void> {
  const url = pickWebhook(opts.competitionCode);
  if (!url) {
    throw new Error(
      "DISCORD_WEBHOOK_URL is missing. Set it in .env.local (or env var) and restart.",
    );
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "Football Radar",
      ...msg,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Discord ${res.status}: ${body.slice(0, 200)}`);
  }
}

// 颜色（十进制整数）
export const COLOR = {
  accent: 0x22c55e, // 强强对话
  derby: 0xf59e0b, // 德比
  champions: 0xfacc15, // 欧冠
  muted: 0x6b7280, // 普通
} as const;
