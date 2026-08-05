/**
 * 법정점검 주기 엔진 검증 — `npx tsx inspection.test.ts` (DB 불필요)
 * 날짜 계산 오류가 곧 과태료인 모듈이라 엔진을 화면보다 먼저 굳힌다.
 */
import assert from "node:assert/strict";
import {
  addMonthsYmd,
  daysUntil,
  dueMilestone,
  nextDue,
  roundKey,
  statusOf,
  cycleToRow,
} from "./src/lib/inspection/schedule";

const kst = (ymd: string) => new Date(`${ymd}T12:00:00+09:00`);

// ── 월 더하기: 같은 날, 말일 잘림, 윤년, 연 경계 ─────────────────
assert.equal(addMonthsYmd("2026-03-15", 1), "2026-04-15");
assert.equal(addMonthsYmd("2026-01-31", 1), "2026-02-28"); // 말일 잘림
assert.equal(addMonthsYmd("2024-01-31", 1), "2024-02-29"); // 윤년 2월
assert.equal(addMonthsYmd("2024-02-29", 12), "2025-02-28"); // 윤년 앵커 + 1년
assert.equal(addMonthsYmd("2024-02-29", 48), "2028-02-29"); // 윤년 → 윤년
assert.equal(addMonthsYmd("2026-08-31", 1), "2026-09-30");
assert.equal(addMonthsYmd("2026-11-15", 3), "2027-02-15"); // 연 경계(분기)
assert.equal(addMonthsYmd("2026-12-31", 6), "2027-06-30"); // 연 경계(반기)
assert.equal(addMonthsYmd("2026-07-01", 36), "2029-07-01"); // 3년

// ── nextDue: 주기별 ──────────────────────────────────────────────
const item = (cycleType: string, lastYmd: string | null, cycleN?: number, leadDays = 7) => ({
  cycleType,
  cycleN: cycleN ?? null,
  leadDays,
  lastDoneAt: lastYmd ? new Date(`${lastYmd}T00:00:00+09:00`) : null,
});

assert.equal(nextDue(item("MONTHLY", "2026-07-15")), "2026-08-15");
assert.equal(nextDue(item("QUARTERLY", "2026-01-31")), "2026-04-30");
assert.equal(nextDue(item("SEMIANNUAL", "2026-03-10")), "2026-09-10");
assert.equal(nextDue(item("ANNUAL", "2025-08-20")), "2026-08-20");
assert.equal(nextDue(item("YEARS", "2024-05-01", 2)), "2026-05-01");
assert.equal(nextDue(item("YEARS", "2023-06-15", 3)), "2026-06-15");
assert.equal(nextDue(item("ANNUAL", null)), null);

// KST 자정 경계 — UTC로 자르면 앵커가 하루 밀린다.
// 2026-07-15 00:00 KST = 2026-07-14 15:00 UTC
const midnight = { cycleType: "MONTHLY", cycleN: null, leadDays: 7, lastDoneAt: new Date("2026-07-14T15:00:00Z") };
assert.equal(nextDue(midnight), "2026-08-15"); // UTC로 읽었으면 08-14

// ── daysUntil / statusOf ────────────────────────────────────────
assert.equal(daysUntil("2026-08-10", kst("2026-08-05")), 5);
assert.equal(daysUntil("2026-08-05", kst("2026-08-05")), 0);
assert.equal(daysUntil("2026-08-01", kst("2026-08-05")), -4);

// ok → imminent → overdue 전이 (연 1회, lead 30)
const annual = (last: string) => item("ANNUAL", last, undefined, 30);
assert.equal(statusOf(annual("2025-09-20"), kst("2026-08-05")), "ok"); // 도래 9/20, D-46
assert.equal(statusOf(annual("2025-08-20"), kst("2026-08-05")), "imminent"); // D-15
assert.equal(statusOf(annual("2025-08-05"), kst("2026-08-05")), "imminent"); // 당일 D-0
assert.equal(statusOf(annual("2025-08-04"), kst("2026-08-05")), "overdue"); // 하루 지남
assert.equal(statusOf(item("ANNUAL", null), kst("2026-08-05")), "needsAnchor");

// ── 크론 회차: 임계를 처음 넘긴 때 (작은 것부터) ─────────────────
assert.equal(dueMilestone(45, 30), null); // 아직
assert.equal(dueMilestone(30, 30), 30); // D-30 진입
assert.equal(dueMilestone(25, 30), 30); // 크론이 하루 빠져도 잡힌다
assert.equal(dueMilestone(7, 30), 7); // 마지막 안내 — 30이 먼저 걸리면 안 된다
assert.equal(dueMilestone(3, 30), 7);
assert.equal(dueMilestone(0, 30), 7);
assert.equal(dueMilestone(-1, 30), null); // 지연은 회차가 아니라 overdue 키
assert.equal(dueMilestone(5, 7), 7); // lead 7이면 회차는 하나뿐
assert.deepEqual(roundKey("abc", "2026-09-20", 30), "inspection_abc_2026-09-20_D30");
assert.deepEqual(roundKey("abc", "2026-09-20", "overdue"), "inspection_abc_2026-09-20_overdue");

// 기록 저장 → lastDoneAt 갱신 → 도래일이 굴러가 새 회차 키가 열린다
const before = item("MONTHLY", "2026-07-15");
const after = item("MONTHLY", "2026-08-14");
assert.notEqual(
  roundKey("x", nextDue(before)!, 7),
  roundKey("x", nextDue(after)!, 7),
);

// ── cycleToRow ──────────────────────────────────────────────────
assert.deepEqual(cycleToRow({ type: "MONTHLY" }), { cycleType: "MONTHLY", cycleN: null });
assert.deepEqual(cycleToRow({ type: "YEARS", n: 3 }), { cycleType: "YEARS", cycleN: 3 });

console.log("inspection OK");
