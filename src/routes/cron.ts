import { Router } from "express";
import { checkAllProducts } from "../lib/checkProducts";
import { asyncHandler } from "../lib/asyncHandler";

export const cronRouter = Router();

/**
 * Render 무료 Web 서비스는 Cron Job 무료 플랜이 없으므로, 외부 스케줄러(GitHub Actions)가
 * 이 엔드포인트를 매시간 호출해 체크를 트리거한다. 대시보드 로그인 쿠키가 아니라
 * 별도의 고정 시크릿 헤더로 인증한다.
 */
cronRouter.post(
  "/check",
  asyncHandler(async (req, res) => {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
      res.status(500).json({ error: "서버에 CRON_SECRET이 설정되어 있지 않습니다." });
      return;
    }
    if (req.header("x-cron-secret") !== secret) {
      res.status(401).json({ error: "인증되지 않은 요청입니다." });
      return;
    }

    await checkAllProducts();
    res.json({ ok: true, checkedAt: new Date().toISOString() });
  })
);
