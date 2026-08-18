import type { Request, Response, NextFunction } from "express";

export const AUTH_COOKIE = "musinsa_monitor_auth";

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.signedCookies?.[AUTH_COOKIE] === "ok") {
    next();
    return;
  }
  res.status(401).json({ error: "로그인이 필요합니다." });
}

export function login(req: Request, res: Response): void {
  const expected = process.env.DASHBOARD_PASSWORD;
  if (!expected) {
    res.status(500).json({ error: "서버에 DASHBOARD_PASSWORD가 설정되어 있지 않습니다." });
    return;
  }

  const { password } = req.body ?? {};
  if (password !== expected) {
    res.status(401).json({ error: "비밀번호가 올바르지 않습니다." });
    return;
  }

  res.cookie(AUTH_COOKIE, "ok", {
    httpOnly: true,
    signed: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
  res.json({ ok: true });
}

export function logout(_req: Request, res: Response): void {
  res.clearCookie(AUTH_COOKIE);
  res.json({ ok: true });
}

export function me(req: Request, res: Response): void {
  res.json({ authenticated: req.signedCookies?.[AUTH_COOKIE] === "ok" });
}
