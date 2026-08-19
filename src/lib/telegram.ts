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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** 리뷰 본문을 최대 2줄 정도로 요약한다 (대시보드 카드의 2줄 미리보기와 맞춤). */
function reviewSnippet(content: string): string {
  const lines = content.trim().split(/\r?\n/).slice(0, 2).join(" ");
  const MAX_LEN = 90;
  return lines.length > MAX_LEN ? `${lines.slice(0, MAX_LEN)}…` : lines;
}

function formatPostedDate(postedAt: string | null): string {
  if (!postedAt) return "-";
  return new Date(postedAt).toLocaleDateString("ko-KR");
}

/** 대시보드 카드의 "👍 도움돼요 N" 표기·링크와 동일하게 맞춘 캡션 (HTML parse_mode) */
function buildCaption(productName: string, event: RankChangeEvent): string {
  const reviewUrl = `https://www.musinsa.com/review/${event.reviewNo}`;
  const snippet = reviewSnippet(event.content);
  return [
    `[${escapeHtml(productName)}] 포토후기 TOP10 변동`,
    summaryLine(event),
    `작성자: ${escapeHtml(event.nickname)}`,
    `별점: ${stars(event.grade)}`,
    `등록일: ${formatPostedDate(event.postedAt)}`,
    ...(snippet ? [escapeHtml(snippet)] : []),
    `<a href="${reviewUrl}">👍 도움돼요 ${event.likeCount ?? 0}</a>`,
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
    await callTelegramApi("sendPhoto", { photo: event.imageUrl, caption, parse_mode: "HTML" });
  } else {
    await callTelegramApi("sendMessage", { text: caption, parse_mode: "HTML" });
  }
}

export async function notifyRankChanges(productName: string, events: RankChangeEvent[]): Promise<void> {
  for (const event of events) {
    await sendChangeNotification(productName, event);
  }
}
