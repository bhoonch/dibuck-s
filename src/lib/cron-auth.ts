import { createHash, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

/**
 * 크론 시크릿 검사 — 세 크론 라우트가 같은 검사를 쓴다. fail-closed(시크릿 미설정 = 거부).
 * `!==` 문자열 비교는 일치 길이만큼 시간이 달라진다 — sha256으로 길이를 고정한 뒤
 * timingSafeEqual로 상수시간 비교한다.
 */
export function cronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(
    digest(req.headers.get("authorization") ?? ""),
    digest(`Bearer ${secret}`),
  );
}
