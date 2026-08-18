import type { TopReview } from "./musinsa";

export interface RankChangeEvent {
  reviewNo: number;
  changeType: "entered" | "dropped";
  oldRank: number | null;
  newRank: number | null;
  nickname: string;
  grade: string | null;
  imageUrl: string | null;
}

/**
 * 이전 TOP10과 새 TOP10을 review_no 집합 기준으로 비교한다.
 * 같은 10명이 순서만 바뀐 경우는 이벤트를 만들지 않는다 (알림 스팸 방지).
 */
export function diffTop10(previous: TopReview[], current: TopReview[]): RankChangeEvent[] {
  const prevByNo = new Map(previous.map((r) => [r.reviewNo, r]));
  const currByNo = new Map(current.map((r) => [r.reviewNo, r]));

  const events: RankChangeEvent[] = [];

  for (const review of current) {
    if (!prevByNo.has(review.reviewNo)) {
      events.push({
        reviewNo: review.reviewNo,
        changeType: "entered",
        oldRank: null,
        newRank: review.rank,
        nickname: review.nickname,
        grade: review.grade,
        imageUrl: review.imageUrl,
      });
    }
  }

  for (const review of previous) {
    if (!currByNo.has(review.reviewNo)) {
      events.push({
        reviewNo: review.reviewNo,
        changeType: "dropped",
        oldRank: review.rank,
        newRank: null,
        nickname: review.nickname,
        grade: review.grade,
        imageUrl: review.imageUrl,
      });
    }
  }

  return events;
}
