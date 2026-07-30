/**
 * 기안·품의 법률 규칙 엔진 검증 — `npx tsx gian-rules.test.ts` (DB 불필요)
 * 금액 판정이 틀리면 과태료·계약 무효로 이어진다 — 경계값을 전부 박아 둔다.
 */
import assert from "node:assert/strict";
import {
  buildApprovalSteps,
  orderInternalLine,
  classify,
  formatMoney,
  legalNoticesFor,
  toKoreanMoney,
  vatExcludedOf,
} from "./src/lib/gian/rules";

// ── VAT 환산 · 500만 경계 ──
// 5,500,000원(VAT 포함) = 제외 5,000,000원 — 딱 한도, 수의계약 가능
assert.equal(vatExcludedOf(5_500_000, true), 5_000_000);
assert.equal(classify({ amountRaw: 5_500_000, vatIncluded: true, texts: [] }).context, "direct");
// 5,500,001원(VAT 포함) → 제외 5,000,001원 — 입찰
assert.equal(classify({ amountRaw: 5_500_001, vatIncluded: true, texts: [] }).context, "bid");
// VAT 별도 입력은 환산 없이 그대로 비교
assert.equal(classify({ amountRaw: 5_000_000, vatIncluded: false, texts: [] }).context, "direct");
assert.equal(classify({ amountRaw: 5_000_001, vatIncluded: false, texts: [] }).context, "bid");
// 포함가 그대로 비교했다면 오판정됐을 구간 (제외 455만 = 포함 500.5만)
assert.equal(classify({ amountRaw: 5_400_000, vatIncluded: true, texts: [] }).context, "direct");

// ── 문서 유형 · 결재선 단수 ──
// 예산 없음 → 기안서, 외부 결재자 없음 (3단)
const gian = classify({ amountRaw: 0, vatIncluded: true, texts: ["정기점검 안내"] });
assert.equal(gian.docType, "gian");
assert.deepEqual(gian.externalApprovers, []);
// 예산 있음 → 품의서 +회장 (4단)
const pumui = classify({ amountRaw: 4_500_000, vatIncluded: true, texts: ["LED 등기구 교체"] });
assert.equal(pumui.docType, "pumui");
assert.deepEqual(pumui.externalApprovers, ["CHAIR"]);
// 장충금 키워드 + 예산 → 공사 추진 +감사+회장 (5단), 키워드는 어느 필드에 있어도 잡힌다
const ltp = classify({
  amountRaw: 45_000_000,
  vatIncluded: true,
  texts: ["도막 재시공", "101동~105동 옥상", "누수 민원"],
});
assert.equal(ltp.docType, "ltp_work");
assert.equal(ltp.isLtp, true);
assert.deepEqual(ltp.externalApprovers, ["AUDITOR", "CHAIR"]); // 서식 9 순서: 감사 → 회장
// 예산 없는 장충금 언급은 일반 기안 (경고만, 5단 아님)
const ltpNoBudget = classify({ amountRaw: 0, vatIncluded: true, texts: ["승강기 점검"] });
assert.equal(ltpNoBudget.docType, "gian");
assert.equal(ltpNoBudget.isLtp, true);

// ── 한글 금액 — 변조 방지 표기라 1도 생략하지 않는다 (일십·일백·일천) ──
assert.equal(toKoreanMoney(4_500_000), "금사백오십만원");
assert.equal(toKoreanMoney(880_000), "금팔십팔만원");
assert.equal(toKoreanMoney(45_000_000), "금사천오백만원");
assert.equal(toKoreanMoney(85_000), "금팔만오천원");
assert.equal(toKoreanMoney(100_000_000), "금일억원");
assert.equal(toKoreanMoney(12_345), "금일만이천삼백사십오원");
assert.equal(toKoreanMoney(10_000_000), "금일천만원");
assert.equal(toKoreanMoney(100_000), "금일십만원");
assert.equal(toKoreanMoney(0), "");
assert.equal(
  formatMoney(4_500_000, true),
  "금 4,500,000원 (금사백오십만원 / VAT 포함)",
);

// ── 법적 유의사항 — 경고는 실제로 해당할 때만 뜬다 ──
assert.equal(legalNoticesFor(gian).length, 0); // 예산 없는 기안서엔 경고 없음
// 예산 0 + 장충금 키워드: "집행하면 과태료"는 집행이 없으니 오탐 — 뜨면 안 된다
assert.equal(legalNoticesFor(ltpNoBudget).length, 0);
assert.ok(legalNoticesFor(pumui).some((n) => n.includes("수의계약")));
assert.ok(legalNoticesFor(ltp).some((n) => n.includes("전자입찰")));
assert.ok(legalNoticesFor(ltp).some((n) => n.includes("장기수선계획")));

// ── 결재선 스냅샷 조립 ──
const internal = [
  { userId: "u1", name: "김담당" },
  { userId: "u2", name: "박과장" },
  { userId: "u3", name: "이소장" },
];
const external = [
  { role: "CHAIR" as const, name: "최회장" },
  { role: "AUDITOR" as const, name: "정감사" },
];
// 5단: 담당→과장→소장→감사→회장
const five = buildApprovalSteps(ltp, internal, external);
assert.equal(five.missing.length, 0);
assert.deepEqual(
  five.steps.map((s) => s.name),
  ["김담당", "박과장", "이소장", "정감사", "최회장"],
);
assert.deepEqual(five.steps.map((s) => s.order), [1, 2, 3, 4, 5]);
assert.equal(five.steps[3].externalRole, "AUDITOR");
assert.equal(five.steps[4].externalRole, "CHAIR");
// 회장 미등록이면 missing으로 상신을 막는다
const noChair = buildApprovalSteps(pumui, internal, [
  { role: "AUDITOR", name: "정감사" },
]);
assert.deepEqual(noChair.missing, ["CHAIR"]);
// 기안서는 내부 결재선만
assert.equal(buildApprovalSteps(gian, internal, external).steps.length, 3);

// ── 기안자가 결재란 첫 칸(담당) ──
const lineIds = ["u1", "u2", "u3"];
// 명단에 없는 사람이 기안하면 맨 앞에 붙는다
assert.deepEqual(orderInternalLine(lineIds, "u9"), ["u9", "u1", "u2", "u3"]);
// 명단에 있으면 앞으로 당기고 원래 자리는 지운다 — 같은 사람이 두 칸 차지하면 안 된다
assert.deepEqual(orderInternalLine(lineIds, "u2"), ["u2", "u1", "u3"]);
assert.deepEqual(orderInternalLine(lineIds, "u1"), ["u1", "u2", "u3"]);
// 기안자를 모르는 문서(파생·시스템 생성)는 설정 결재선 그대로
assert.deepEqual(orderInternalLine(lineIds, null), lineIds);
assert.deepEqual(orderInternalLine(lineIds), lineIds);

// ── 재원 선택이 키워드 추측을 이긴다 ──
// "소방 점검"은 장충금 키워드에 걸리지만, 사용자가 수선유지비를 고르면 품의서다
const keywordOnly = classify({
  amountRaw: 3_000_000,
  vatIncluded: false,
  texts: ["소방시설 점검"],
});
assert.equal(keywordOnly.docType, "ltp_work");
const chosen = classify({
  amountRaw: 3_000_000,
  vatIncluded: false,
  texts: ["소방시설 점검"],
  fund: "maintenance",
});
assert.equal(chosen.docType, "pumui");

// ── 소장 전결 한도 ──
const base = {
  amountRaw: 3_000_000,
  vatIncluded: false,
  texts: ["분리수거장 보수"],
  fund: "maintenance" as const,
};
// 한도 미설정: 지출이면 회장이 붙는다 (예전 동작 그대로)
assert.deepEqual(classify(base).externalApprovers, ["CHAIR"]);
// 한도 이하 + 예산 반영: 소장 전결 — 회장 없음
const within = classify({ ...base, directorLimit: 5_000_000 });
assert.equal(within.withinDirectorLimit, true);
assert.deepEqual(within.externalApprovers, []);
// 한도 초과: 회장 복귀
assert.deepEqual(
  classify({ ...base, directorLimit: 1_000_000 }).externalApprovers,
  ["CHAIR"],
);
// 예산 외 집행은 한도 이하라도 회장 — 의결 대상인 단지가 많다
assert.deepEqual(
  classify({ ...base, directorLimit: 5_000_000, budgeted: false })
    .externalApprovers,
  ["CHAIR"],
);
// 장충금은 한도와 무관하게 감사+회장
assert.deepEqual(
  classify({ ...base, fund: "ltp", directorLimit: 999_000_000 })
    .externalApprovers,
  ["AUDITOR", "CHAIR"],
);
// 한도는 VAT 제외액으로 비교한다 — 포함가로 비교하면 330만이 한도를 넘는다
assert.equal(
  classify({
    ...base,
    amountRaw: 3_300_000,
    vatIncluded: true,
    directorLimit: 3_000_000,
  }).withinDirectorLimit,
  true,
);

console.log("gian-rules OK");
