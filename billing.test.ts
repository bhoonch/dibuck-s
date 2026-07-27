/**
 * 청구 계산 검증 — `npx tsx billing.test.ts` (DB 불필요)
 *
 * 여기가 틀리면 돈이 잘못 빠져나가거나 안 빠져나간다.
 */
import assert from "node:assert/strict";
import {
  GRACE_DAYS,
  billableItems,
  daysBetween,
  dunningAction,
  nextBillingDate,
  orderId,
  totalAmount,
} from "./src/lib/billing";

const kst = (s: string) => new Date(`${s}+09:00`);
const now = kst("2026-08-10T10:00:00");

// ── 청구 대상 ────────────────────────────────────────────────
const mods = [
  { id: "a", name: "미납 독촉장", price: 39000, status: "ACTIVE", trialEndsAt: null },
  // 체험 중(미래) — 이번 청구에서 빠진다
  { id: "b", name: "계약서", price: 29000, status: "ACTIVE", trialEndsAt: kst("2026-08-20T00:00:00") },
  // 체험 만료(과거) — 유료로 청구된다
  { id: "c", name: "민원", price: 19000, status: "ACTIVE", trialEndsAt: kst("2026-08-01T00:00:00") },
  // 해지한 모듈은 청구하지 않는다
  { id: "d", name: "해지함", price: 99000, status: "CANCELED", trialEndsAt: null },
];
const items = billableItems(mods, now);
assert.deepEqual(items.map((i) => i.moduleId), ["a", "c"]);
assert.equal(totalAmount(items), 58000);
assert.equal(totalAmount([]), 0);

// ── 다음 청구일: 말일 처리 ────────────────────────────────────
// 1/31 가입자는 2월에 28일로 잘리지만 기준일(31)은 그대로 → 3월엔 다시 31일
assert.equal(nextBillingDate(kst("2026-01-31T00:00:00"), 31).toISOString(),
  kst("2026-02-28T00:00:00").toISOString());
assert.equal(nextBillingDate(kst("2026-02-28T00:00:00"), 31).toISOString(),
  kst("2026-03-31T00:00:00").toISOString());
// 윤년 2월
assert.equal(nextBillingDate(kst("2028-01-15T00:00:00"), 29).toISOString(),
  kst("2028-02-29T00:00:00").toISOString());
// 연말 넘김
assert.equal(nextBillingDate(kst("2026-12-15T00:00:00"), 15).toISOString(),
  kst("2027-01-15T00:00:00").toISOString());
// KST 자정 이전(UTC로는 전날)에 계산해도 날짜가 밀리지 않는다
assert.equal(nextBillingDate(kst("2026-08-31T08:00:00"), 31).toISOString(),
  kst("2026-09-30T00:00:00").toISOString());

// ── 경과 일수는 KST 날짜 기준 ─────────────────────────────────
assert.equal(daysBetween(kst("2026-08-01T23:00:00"), kst("2026-08-02T01:00:00")), 1);
assert.equal(daysBetween(kst("2026-08-01T00:00:00"), kst("2026-08-01T23:59:00")), 0);

// ── 크론 판정 ────────────────────────────────────────────────
const base = { billingKey: "bk", pastDueSince: null, nextBillingAt: null };

// 카드 없으면 아무것도 안 한다
assert.equal(dunningAction({ ...base, billingKey: null, status: "ACTIVE" }, now), "none");
assert.equal(dunningAction({ ...base, status: "NONE" }, now), "none");
// 이미 정지된 단지는 크론이 건드리지 않는다 (셀프 재결제로만 풀린다)
assert.equal(dunningAction({ ...base, status: "SUSPENDED" }, now), "none");

// 청구일 전이면 대기, 당일·경과면 청구
assert.equal(
  dunningAction({ ...base, status: "ACTIVE", nextBillingAt: kst("2026-08-11T00:00:00") }, now),
  "none",
);
assert.equal(
  dunningAction({ ...base, status: "ACTIVE", nextBillingAt: kst("2026-08-10T00:00:00") }, now),
  "charge",
);
assert.equal(
  dunningAction({ ...base, status: "ACTIVE", nextBillingAt: kst("2026-08-01T00:00:00") }, now),
  "charge",
);

// 유예 중이면 매일 재시도, 유예를 넘기면 정지
const pastDue = (since: string) =>
  dunningAction({ ...base, status: "PAST_DUE", pastDueSince: kst(since) }, now);
assert.equal(pastDue("2026-08-10T00:00:00"), "retry"); // 실패 당일
assert.equal(pastDue("2026-08-06T00:00:00"), "retry"); // D+4
assert.equal(pastDue("2026-08-03T00:00:00"), "suspend"); // D+7 = 유예 끝
assert.equal(pastDue("2026-07-01T00:00:00"), "suspend");
assert.equal(GRACE_DAYS, 7);

// ── 주문번호 ─────────────────────────────────────────────────
// 재시도마다 달라야 한다(같은 orderId로 두 번 결제하면 토스가 거부한다)
const o1 = orderId("tenant123", kst("2026-08-10T10:00:00"));
const o2 = orderId("tenant123", kst("2026-08-10T10:00:01"));
assert.notEqual(o1, o2);
assert.match(o1, /^[A-Za-z0-9_-]{6,64}$/); // 토스 허용 문자·길이

console.log("billing.test.ts — 모든 검증 통과");
