/**
 * 비밀번호 재설정 토큰 판정 — `npx tsx password-reset.test.ts` (DB 불필요)
 *
 * 여기서 틀리면 만료·사용된 링크로 남의 비밀번호가 바뀌므로 반드시 통과해야 한다.
 */
import assert from "node:assert/strict";
import {
  RESET_TTL_MS,
  hashResetToken,
  resetToken,
  resetTokenState,
} from "./src/lib/password-reset";

const now = new Date("2026-08-01T12:00:00+09:00");
const future = new Date(now.getTime() + 10 * 60_000);
const past = new Date(now.getTime() - 1);

assert.equal(resetTokenState(null, now), "notfound");
assert.equal(resetTokenState({ expiresAt: future, usedAt: null }, now), "valid");
assert.equal(resetTokenState({ expiresAt: past, usedAt: null }, now), "expired");

// 사용됨이 만료보다 우선 — 이미 쓴 링크는 유효기간이 남아 있어도 못 쓴다
assert.equal(resetTokenState({ expiresAt: future, usedAt: now }, now), "used");
assert.equal(resetTokenState({ expiresAt: past, usedAt: now }, now), "used");

// 경계: 만료 시각 정각은 만료로 본다(<=)
assert.equal(resetTokenState({ expiresAt: now, usedAt: null }, now), "expired");

// 유효기간 1시간 — 인증 링크(24h)보다 짧게 유지할 것
assert.equal(RESET_TTL_MS, 60 * 60_000);

// 토큰은 256비트 랜덤 hex, 매번 달라야 한다
const a = resetToken();
assert.equal(a.length, 64);
assert.match(a, /^[0-9a-f]{64}$/);
assert.notEqual(a, resetToken());

// DB에는 해시만 저장한다 — 평문 그대로면 DB 유출이 곧 계정 탈취다.
// 같은 토큰 → 같은 해시(조회 키로 쓴다), 해시에서 토큰은 못 되돌린다.
assert.equal(hashResetToken(a), hashResetToken(a));
assert.notEqual(hashResetToken(a), a);
assert.match(hashResetToken(a), /^[0-9a-f]{64}$/);

console.log("password-reset.test.ts — 모든 검증 통과");
