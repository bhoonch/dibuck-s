/**
 * KST 날짜 헬퍼 검증 — `npx tsx dates.test.ts`
 * UTC로 자르면 오전 9시 이전에 하루가 밀리는 게 원래 버그였다.
 */
import assert from "node:assert/strict";
import {
  dayKst,
  kstDayEnd,
  kstDayStart,
  mdKst,
  normalizeEmail,
  ymdKst,
} from "./src/lib/utils";

// 2026-07-27 08:00 KST = 2026-07-26 23:00 UTC — UTC로 자르면 "26일"이 된다
const morning = new Date("2026-07-26T23:00:00Z");
assert.equal(ymdKst(morning), "2026-07-27");
assert.equal(morning.toISOString().slice(0, 10), "2026-07-26"); // 고치기 전 동작
assert.equal(mdKst(morning), "07-27");
assert.equal(dayKst(morning), 1); // 2026-07-27은 월요일

// KST 자정 직후·직전 경계
assert.equal(ymdKst(new Date("2026-07-26T15:00:00Z")), "2026-07-27"); // KST 00:00
assert.equal(ymdKst(new Date("2026-07-26T14:59:59Z")), "2026-07-26"); // KST 23:59

// 게시 기간: 시작일은 그날 0시부터, 종료일은 그날이 다 지나야 끝난다
const start = kstDayStart("2026-07-27");
const end = kstDayEnd("2026-07-27");
assert.equal(start.toISOString(), "2026-07-26T15:00:00.000Z");
assert.equal(end.toISOString(), "2026-07-27T14:59:59.999Z");
assert.ok(start < end);
// 종료일 당일 오전 9시(KST)에도 아직 게시 중이어야 한다 — 이게 원래 결함
assert.ok(new Date("2026-07-27T00:00:00Z") < end);

// 이메일 정규화 — 대소문자 다른 가입/로그인이 같은 계정을 가리켜야 한다
assert.equal(normalizeEmail("  Kim@Test.COM "), "kim@test.com");
assert.equal(normalizeEmail(undefined), "");

console.log("dates OK");
