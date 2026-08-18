import "dotenv/config";
import path from "node:path";
import express, { type ErrorRequestHandler } from "express";
import cookieParser from "cookie-parser";
import { requireAuth, login, logout, me } from "./middleware/auth";
import { productsRouter } from "./routes/products";
import { changesRouter } from "./routes/changes";
import { checkRouter } from "./routes/check";
import { cronRouter } from "./routes/cron";
import { summaryRouter } from "./routes/summary";

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET 환경변수가 설정되어 있지 않습니다. .env를 확인하세요.");
}
if (!process.env.DASHBOARD_PASSWORD) {
  console.warn("경고: DASHBOARD_PASSWORD가 설정되어 있지 않아 로그인이 항상 실패합니다.");
}

const app = express();

app.use(express.json());
app.use(cookieParser(process.env.SESSION_SECRET));
app.use(express.static(path.join(__dirname, "..", "public")));

app.post("/api/login", login);
app.post("/api/logout", logout);
app.get("/api/me", me);

app.use("/api/products", requireAuth, productsRouter);
app.use("/api/changes", requireAuth, changesRouter);
app.use("/api/check-now", requireAuth, checkRouter);
app.use("/api/summary", requireAuth, summaryRouter);
app.use("/api/cron", cronRouter);

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "서버 오류가 발생했습니다." });
};
app.use(errorHandler);

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`서버 실행 중: http://localhost:${port}`);
});
