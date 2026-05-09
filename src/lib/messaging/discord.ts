// Discord Webhook 客户端。最多每条消息 2000 字符，多嵌入(embed)走 embeds[]。
//
// 支持按比赛类型路由到不同 webhook：
//   - DISCORD_WEBHOOK_URL          默认（联赛 / 欧冠 / 早报 / 周报）
//   - DISCORD_WEBHOOK_URL_WC       世界杯专用频道
// 缺失某个特殊 webhook 时回退到 DISCORD_WEBHOOK_URL。

function pickWebhook(competitionCode?: string): string | undefined {
  if (competitionCode === "WC") {
    return process.env.DISCORD_WEBHOOK_URL_WC || process.env.DISCORD_WEBHOOK_URL;
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
}

export interface SendDiscordOptions {
  /** 比赛 competition code，用于路由到对应 webhook（如 WC 走世界杯频道） */
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
