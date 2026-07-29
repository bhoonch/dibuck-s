/**
 * 견적서 첨부 판정 검증 — `npx tsx gian-attachment.test.ts` (DB 불필요)
 * 이 판정이 상신 차단의 기준이다: 수의계약은 업체마다, 입찰은 문서에 1장.
 */
import assert from "node:assert/strict";
import {
  attachmentLines,
  quoteFileGap,
  waiverNoteOf,
} from "./src/lib/gian/attachments";

const q = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ vendor: `업체${i + 1}` }));
const f = (...idx: (number | null)[]) => idx.map((quoteIndex) => ({ quoteIndex }));

// 예산 없는 기안 — 강제하지 않는다 (사용자 결정)
assert.equal(quoteFileGap("none", [], []), null);

// 수의계약 — 입력된 업체 전부, 각각 1장 이상
assert.notEqual(quoteFileGap("direct", q(2), []), null);
assert.notEqual(quoteFileGap("direct", q(2), f(0)), null);
assert.equal(quoteFileGap("direct", q(2), f(0, 1)), null);
// 한 업체에 몰아 올려도 2인 견적이 되지 않는다
assert.notEqual(quoteFileGap("direct", q(2), f(0, 0)), null);
// 3곳 적었으면 3곳 전부 — 비교표에 실린 금액은 전부 증빙 (사용자 결정)
assert.notEqual(quoteFileGap("direct", q(3), f(0, 1)), null);
assert.equal(quoteFileGap("direct", q(3), f(0, 1, 2)), null);
// 문서 단위 첨부는 업체 증빙을 대신하지 못한다
assert.notEqual(quoteFileGap("direct", q(2), f(null, null)), null);
// 업체당 여러 장은 괜찮다
assert.equal(quoteFileGap("direct", q(2), f(0, 0, 1)), null);
// 부족 메시지에 빠진 업체명이 들어간다 — 사용자가 뭘 올려야 하는지 안다
assert.ok(quoteFileGap("direct", q(2), f(0))!.includes("업체2"));

// 입찰 — 견적서를 받는 절차가 아니다. 아무 첨부 1장(산출근거 등)이면 충분
assert.notEqual(quoteFileGap("bid", [], []), null);
assert.equal(quoteFileGap("bid", [], f(null)), null);
assert.equal(quoteFileGap("bid", q(2), f(0)), null); // 업체 줄 첨부도 증빙이다

// ── 미첨부 사유 한 줄 ──
const w = { reason: "긴급 누수", byName: "김소장", at: "2026-07-29" };
// 사유가 없으면 줄도 없다
assert.equal(waiverNoteOf("direct", q(2), f(0), null), null);
// 증빙이 부족한 채 사유가 있으면 찍힌다
const note = waiverNoteOf("direct", q(2), f(0), w);
assert.ok(note?.startsWith("※ 견적서 미첨부"));
assert.ok(note!.includes("긴급 누수") && note!.includes("김소장"));
// 반려 후 파일을 채우면 낡은 사유는 찍지 않는다 (지우지 않고 판정에서 뺀다)
assert.equal(waiverNoteOf("direct", q(2), f(0, 1), w), null);
// 예산 없는 문서는 애초에 강제하지 않으므로 사유가 남아 있어도 안 찍는다
assert.equal(waiverNoteOf("none", [], [], w), null);

// ── 붙임 목록: 실제 첨부가 있으면 그것이 사실이다 ──
const F = (quoteIndex: number | null, name: string) => ({ quoteIndex, name });
// 파일이 없으면 생성 문구 그대로 (파일 없는 서류 목록도 붙임의 역할)
assert.deepEqual(attachmentLines(q(2), [], ["견적서 2부."]), ["견적서 2부."]);
// 업체 파일 → 업체명 줄로 대체, 견적서 아닌 문구는 남는다
assert.deepEqual(
  attachmentLines(
    q(2),
    [F(0, "a.webp"), F(1, "b.pdf")],
    ["견적서 2부.", "사업자등록증 사본 1부."],
  ),
  ["견적서(업체1) 1부.", "견적서(업체2) 1부.", "사업자등록증 사본 1부."],
);
// 같은 업체 사진 2장이어도 1부 — 장수가 부수가 아니다
assert.deepEqual(attachmentLines(q(1), [F(0, "a.webp"), F(0, "b.webp")], []), [
  "견적서(업체1) 1부.",
]);
// 파일 없는 업체는 줄이 안 생긴다 (긴급 예외로 상신한 문서)
assert.deepEqual(attachmentLines(q(2), [F(0, "a.webp")], []), [
  "견적서(업체1) 1부.",
]);
// 문서 단위 첨부는 파일명(확장자 제거)으로
assert.deepEqual(attachmentLines([], [F(null, "추정가격 산출근거.pdf")], []), [
  "추정가격 산출근거 1부.",
]);
// 옛 묶음 문구는 통째로 빠진다 — 알려진 천장 (생성 스키마는 항목별로 바뀜)
assert.deepEqual(
  attachmentLines(q(1), [F(0, "a.webp")], [
    "견적서 비교표 및 사업자등록증 각 1부",
    "공사 시방서 1부.",
  ]),
  ["견적서(업체1) 1부.", "공사 시방서 1부."],
);

console.log("✓ 견적서 첨부 판정 통과");
