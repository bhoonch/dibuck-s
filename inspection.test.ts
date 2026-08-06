/**
 * 법정점검 주기 엔진 검증 — `npx tsx inspection.test.ts` (DB 불필요)
 * 날짜 계산 오류가 곧 과태료인 모듈이라 엔진을 화면보다 먼저 굳힌다.
 */
import assert from "node:assert/strict";
import {
  addDaysYmd,
  addMonthsYmd,
  daysUntil,
  dueMilestone,
  followupOf,
  nextDue,
  roundKey,
  statusOf,
  cycleToRow,
} from "./src/lib/inspection/schedule";
import {
  needsFindings,
  resultChoicesOf,
  worstResult,
} from "./src/lib/inspection/catalog";

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

// ── 판정: 놀이시설만 4단계, 대표 판정은 가장 나쁜 것 ─────────────
const PG = resultChoicesOf("playground_monthly");
const DEF = resultChoicesOf("fire_operation");
assert.deepEqual(PG, ["양호", "요주의", "요수리", "이용금지"]);
assert.deepEqual(DEF, ["정상", "지적사항"]);
assert.deepEqual(resultChoicesOf(null), DEF); // 사용자 정의 항목

// 목록·현황판이 읽는 대표 판정 — 좋은 쪽을 고르면 이용금지 기구가 숨는다
assert.equal(worstResult(["양호", "이용금지", "요주의"], PG), "이용금지");
assert.equal(worstResult(["양호", "요주의"], PG), "요주의");
assert.equal(worstResult(["양호", "양호"], PG), "양호");
assert.equal(worstResult([], PG), "양호"); // 기구가 없으면 첫 판정
assert.equal(worstResult(["정상", "지적사항"], DEF), "지적사항");

// 이상 없음만 지적 내용을 비울 수 있다
assert.equal(needsFindings("양호"), false);
assert.equal(needsFindings("정상"), false);
assert.equal(needsFindings("요주의"), true); // 사용연한 경과도 무엇이 걸리는지 남아야 한다
assert.equal(needsFindings("요수리"), true);
assert.equal(needsFindings("이용금지"), true);

// ── 후속 조치 기한 ──────────────────────────────────────────────
assert.equal(addDaysYmd("2026-08-06", 30), "2026-09-05");
assert.equal(addDaysYmd("2026-02-20", 30), "2026-03-22"); // 월 경계
assert.equal(addDaysYmd("2024-02-20", 30), "2024-03-21"); // 윤년

assert.equal(followupOf("양호", "2026-08-06"), null);
assert.equal(followupOf("요주의", "2026-08-06"), null); // 사용연한 경과는 기한이 없다
assert.equal(followupOf("지적사항", "2026-08-06"), null); // 놀이시설 밖에는 조치 기한이 없다

// 이용금지 = 법정 1개월(어린이놀이시설 안전관리법 제15조)
const ban = followupOf("이용금지", "2026-08-06")!;
assert.equal(ban.dueYmd, "2026-09-06");
assert.equal(ban.legal, true);
assert.equal(ban.title, "안전진단 신청");
assert.equal(followupOf("이용금지", "2026-01-31")!.dueYmd, "2026-02-28"); // 말일 잘림

// 요수리 = 앱 기본 30일. legal:false여야 화면·일지가 "법정 기한"이라 말하지 않는다
const fix = followupOf("요수리", "2026-08-06")!;
assert.equal(fix.dueYmd, "2026-09-05");
assert.equal(fix.legal, false);

console.log("inspection OK");
