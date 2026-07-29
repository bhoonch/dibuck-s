/**
 * 탈퇴 유예 계산 검증 — `npx tsx tenant-deletion.test.ts` (DB 불필요)
 * 즉시 삭제를 유예로 바꾼 뒤로 "며칠 남았나"가 배너와 크론 양쪽의 기준이 된다.
 */
import assert from "node:assert/strict";
import { DELETE_GRACE_DAYS, graceDaysLeft } from "./src/lib/tenant-deletion";

const day = 86400000;
const now = new Date("2026-08-01T00:00:00Z");
const ago = (d: number) => new Date(now.getTime() - d * day);

assert.equal(graceDaysLeft(now, now), DELETE_GRACE_DAYS); // 방금 신청 = 30일 남음
assert.equal(graceDaysLeft(ago(1), now), 29);
assert.equal(graceDaysLeft(ago(29.5), now), 1);
assert.equal(graceDaysLeft(ago(30), now), 0);
assert.equal(graceDaysLeft(ago(45), now), 0); // 음수로 내려가지 않는다

console.log("✓ 탈퇴 유예 계산 통과");
