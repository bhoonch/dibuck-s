/**
 * 독촉 문안·단계·엑셀 해석 검증 (DB 불필요) — npx tsx dunning.test.ts
 */
import assert from "node:assert";
import {
  buildLetter,
  koDate,
  latestPerUnit,
  parseAmount,
  parseDunningRows,
  suggestStage,
  won,
} from "./src/lib/dunning";

// 단계 제안: 이력 없음/납부됨 → 1단계, 미납 이력 → 다음 단계, 3이 끝
assert.equal(suggestStage(), 1);
assert.equal(suggestStage(null), 1);
assert.equal(suggestStage({ stage: 2, paidAt: new Date() }), 1);
assert.equal(suggestStage({ stage: 1, paidAt: null }), 2);
assert.equal(suggestStage({ stage: 3, paidAt: null }), 3);

// 금액·날짜 표기
assert.equal(won(456000), "456,000원");
assert.equal(koDate("2026-08-15"), "2026년 8월 15일");

// 엑셀 해석: 머리글 건너뜀, 동·호 접미사 제거, "456,000원" 숫자화, 금액 없는 행 제외
const parsed = parseDunningRows([
  ["동", "호", "미납액", "이름", "미납 기간"],
  ["101동", "502호", "456,000원", "홍길동", "2026년 3월분 ~ 6월분"],
  ["103", "1201", "152000", "", ""],
  ["104", "301", "", "", ""], // 금액 없음 — 대상 아님
]);
assert.equal(parsed.error, undefined);
assert.equal(parsed.rows.length, 2);
assert.deepEqual(parsed.rows[0], {
  dong: "101", ho: "502", amount: 456000,
  name: "홍길동", period: "2026년 3월분 ~ 6월분",
});
assert.equal(parsed.rows[1].name, null);
assert.ok(parseDunningRows([]).error);

// 금액 파싱: 소수점은 앞자리만("456,000.00"이 45,600,000이 되면 안 됨), 음수 행은 0(제외)
assert.equal(parseAmount("456,000.00"), 456000);
assert.equal(parseAmount("-3,000"), 0);
const withEdgeAmounts = parseDunningRows([
  ["105", "101", "456,000.00", "", ""],
  ["106", "101", "-3,000", "", ""], // 음수 — 청구 대상 아님
]);
assert.equal(withEdgeAmounts.rows.length, 1);
assert.equal(withEdgeAmounts.rows[0].amount, 456000);

// 문안: 1단계는 안내, 3단계만 내용증명 발신·수신 블록
const base = {
  row: parsed.rows[0], dueDate: "2026-08-15",
  account: "우리은행 1002-345-678901 (행복아파트관리사무소)",
  office: "행복아파트 관리사무소", address: "서울시 행복구 행복로 123",
};
const first = buildLetter({ ...base, stage: 1 });
assert.equal(first.kind, "관리비 납부 안내문");
assert.equal(first.recipient, "101동 502호 홍길동 님");
assert.equal(first.proof, undefined);
assert.ok(first.table.some((r) => r.k === "미납 금액" && r.v === "456,000원"));
assert.ok(first.table.some((r) => r.k === "납부 기한" && r.v === "2026년 8월 15일"));
assert.ok(first.table.some((r) => r.k === "미납 기간"));

// 기간 없는 세대는 기간 행 자체가 빠진다 — 빈 칸을 인쇄하지 않는다
const noPeriod = buildLetter({ ...base, row: parsed.rows[1], stage: 1 });
assert.ok(!noPeriod.table.some((r) => r.k === "미납 기간"));
assert.equal(noPeriod.recipient, "103동 1201호 입주자 님");

const second = buildLetter({ ...base, stage: 2 });
assert.equal(second.kind, "관리비 납부 최고서");
assert.ok(second.paragraphs.some((p) => p.includes("최고")));

const third = buildLetter({ ...base, stage: 3 });
assert.equal(third.kind, "내용증명");
assert.ok(third.proof);
assert.equal(third.proof!.sender, "행복아파트 관리사무소");
assert.equal(third.proof!.receiver, "홍길동 (101동 502호)");
assert.equal(third.proof!.receiverAddr, "서울시 행복구 행복로 123 101동 502호");
assert.ok(third.paragraphs.some((p) => p.includes("지급명령")));

// (동,호)별 최신 하나만 — desc 정렬 전제, 처음 만난 것이 남는다
const dedup = latestPerUnit([
  { dong: "101", ho: "502", stage: 2 }, // 최신
  { dong: "103", ho: "1201", stage: 1 },
  { dong: "101", ho: "502", stage: 1 }, // 과거 — 버려진다
]);
assert.equal(dedup.length, 2);
assert.equal(dedup.find((e) => e.dong === "101")!.stage, 2);

console.log("dunning.test.ts 통과");
