/**
 * 공지 발송 대상 판정 검증 — `npx tsx announcements.test.ts`
 * 핵심은 "좁은 대상이 전체 공지를 이긴다" — 안 그러면 그 단지에만 보낸 안내가 묻힌다.
 */
import assert from "node:assert/strict";
import {
  matchesTarget,
  pickAnnouncement,
  describeTarget,
  parseTenantIds,
} from "./src/lib/announcements";

const paid = {
  tenantId: "t1",
  subscribedModuleIds: ["dunning", "notice"],
  trialModuleIds: [],
};
const trialing = {
  tenantId: "t2",
  subscribedModuleIds: ["contracts"],
  trialModuleIds: ["contracts"],
};
const none = { tenantId: "t3", subscribedModuleIds: [], trialModuleIds: [] };

const a = (target: string, targetValue: string | null = null) => ({
  target,
  targetValue,
});

// 1) 기본 대상
assert.equal(matchesTarget(a("ALL"), none), true);
assert.equal(matchesTarget(a("SUBSCRIBED"), paid), true);
assert.equal(matchesTarget(a("SUBSCRIBED"), none), false);
assert.equal(matchesTarget(a("UNSUBSCRIBED"), none), true);
assert.equal(matchesTarget(a("UNSUBSCRIBED"), paid), false);

// 2) 체험 — 체험 중인 단지는 "구독 중"이기도 하다 (배타적이지 않음)
assert.equal(matchesTarget(a("TRIAL"), trialing), true);
assert.equal(matchesTarget(a("TRIAL"), paid), false);
assert.equal(matchesTarget(a("SUBSCRIBED"), trialing), true, "체험도 구독 중");

// 3) 특정 모듈 구독 / 미구독
assert.equal(matchesTarget(a("MODULE", "dunning"), paid), true);
assert.equal(matchesTarget(a("MODULE", "contracts"), paid), false);
assert.equal(matchesTarget(a("MODULE_NOT", "contracts"), paid), true, "크로스셀 대상");
assert.equal(matchesTarget(a("MODULE_NOT", "dunning"), paid), false);
assert.equal(matchesTarget(a("MODULE", null), paid), false, "값 없으면 아무에게도 안 감");

// 4) 직접 선택
assert.equal(matchesTarget(a("TENANTS", "t1,t3"), paid), true);
assert.equal(matchesTarget(a("TENANTS", "t1,t3"), trialing), false);
assert.deepEqual(parseTenantIds(" t1 , ,t2 "), ["t1", "t2"], "공백·빈 값 정리");

// 5) 좁은 대상 우선 — 전체 공지가 개별 공지를 덮지 않는다
const all = { id: "all", target: "ALL", targetValue: null };
const mod = { id: "mod", target: "MODULE", targetValue: "dunning" };
const only = { id: "only", target: "TENANTS", targetValue: "t1" };
assert.equal(pickAnnouncement([all, mod], paid)?.id, "mod", "모듈 공지가 전체를 이김");
assert.equal(pickAnnouncement([all, mod, only], paid)?.id, "only", "직접 선택이 가장 우선");
assert.equal(pickAnnouncement([all, mod, only], none)?.id, "all", "조건 안 맞으면 전체로");
assert.equal(pickAnnouncement([mod, only], none), undefined, "맞는 게 없으면 배너 없음");

// 같은 범위끼리는 목록 순서(최신순)를 따른다
const newer = { id: "newer", target: "ALL", targetValue: null };
const older = { id: "older", target: "ALL", targetValue: null };
assert.equal(pickAnnouncement([newer, older], none)?.id, "newer", "동순위면 최신");

// 6) 목록 표기
assert.equal(describeTarget(a("ALL"), {}), "전체 단지");
assert.equal(describeTarget(a("MODULE", "dunning"), { dunning: "미납 독촉장" }), "미납 독촉장 구독");
assert.equal(
  describeTarget(a("MODULE_NOT", "dunning"), { dunning: "미납 독촉장" }),
  "미납 독촉장 미구독",
);
assert.equal(describeTarget(a("TENANTS", "t1,t2")), "단지 2곳 지정");

console.log("announcements OK");
