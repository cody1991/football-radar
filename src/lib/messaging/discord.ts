// Discord Webhook 客户端。最多每条消息 2000 字符，多嵌入(embed)走 embeds[]。

const WEBHOOK = process.env.DISCORD_WEBHOOK_URL;

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

export async function sendDiscord(msg: DiscordMessage): Promise<void> {
  if (!WEBHOOK) {
    throw new Error(
      "DISCORD_WEBHOOK_URL is missing. Set it in .env.local (or env var) and restart.",
    );
  }
  const res = await fetch(WEBHOOK, {
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
