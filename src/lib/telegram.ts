import type { RankChangeEvent } from "./diff";

function stars(grade: string | null): string {
  const n = grade ? Number(grade) : 0;
  if (!n || Number.isNaN(n)) return "평점 없음";
  return "★".repeat(n) + "☆".repeat(Math.max(0, 5 - n));
}

function summaryLine(event: RankChangeEvent): string {
  if (event.changeType === "entered") {
    return event.oldRank == null ? `🆕 신규 진입 ${event.newRank}위` : `🔺 ${event.oldRank}위 → ${event.newRank}위`;
  }
  return `🔻 TOP10 이탈 (이전 ${event.oldRank}위)`;
}

function buildCaption(productName: string, event: RankChangeEvent): string {
  return [
    `[${productName}] 포토후기 TOP10 변동`,
    summaryLine(event),
    `작성자: ${event.nickname}`,
    `별점: ${stars(event.grade)}`,
  ].join("\n");
}

async function callTelegramApi(method: string, payload: Record<string, unknown>): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.warn("TELEGRAM_BOT_TOKEN 또는 TELEGRAM_CHAT_ID가 설정되어 있지 않아 알림을 건너뜁니다.");
    return;
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, ...payload }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`텔레그램 발송 실패 (${method}): ${res.status} ${body}`);
  }
}

async function sendChangeNotification(productName: string, event: RankChangeEvent): Promise<void> {
  const caption = buildCaption(productName, event);

  if (event.imageUrl) {
    await callTelegramApi("sendPhoto", { photo: event.imageUrl, caption });
  } else {
    await callTelegramApi("sendMessage", { text: caption });
  }
}

export async function notifyRankChanges(productName: string, events: RankChangeEvent[]): Promise<void> {
  for (const event of events) {
    await sendChangeNotification(productName, event);
  }
}
