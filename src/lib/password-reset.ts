/**
 * 비밀번호 셀프 재설정 토큰.
 *
 * 위계: 본인(내 계정) → **메일 셀프 재설정(여기)** → 마스터(직원 관리) → 운영자(단지 상세).
 * 마스터·운영자 수동 재설정은 남겨 둔다 — 메일을 못 받는 경우의 백업이다.
 */
import { createHash, randomBytes } from "node:crypto";

/** 1시간 — 재설정 링크는 계정 탈취 수단이므로 인증 링크(24h)보다 짧게 */
export const RESET_TTL_MS = 60 * 60_000;

export function resetToken() {
  return randomBytes(32).toString("hex");
}

/**
 * DB에는 이 해시만 저장한다 — 평문을 두면 DB 유출이 곧 계정 탈취다.
 * 토큰이 256비트 랜덤이라 무차별 대입이 불가능하므로 salt 없는 sha256이면 충분하다
 * (bcrypt는 사용자가 고른 약한 비밀번호를 위한 것).
 */
export function hashResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * 토큰 상태 판정 — DB 없이 검증되도록 순수 함수로 분리했다.
 * 검증: `npx tsx password-reset.test.ts`
 */
export function resetTokenState(
  record: { expiresAt: Date; usedAt: Date | null } | null,
  now = new Date(),
): "valid" | "notfound" | "used" | "expired" {
  if (!record) return "notfound";
  if (record.usedAt) return "used";
  if (record.expiresAt.getTime() <= now.getTime()) return "expired";
  return "valid";
}

export const RESET_STATE_MESSAGE = {
  notfound: "유효하지 않은 링크입니다. 재설정을 다시 요청해 주세요.",
  used: "이미 사용한 링크입니다. 비밀번호를 다시 잊으셨다면 재설정을 새로 요청해 주세요.",
  expired: "링크가 만료되었습니다(발송 후 1시간). 재설정을 다시 요청해 주세요.",
} as const;
