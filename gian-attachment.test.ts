/**
 * 견적서 첨부 판정 검증 — `npx tsx gian-attachment.test.ts` (DB 불필요)
 * 이 판정이 상신 차단의 기준이다: 수의계약은 업체마다, 입찰은 문서에 1장.
 */
import assert from "node:assert/strict";
import { quoteFileGap } from "./src/lib/gian/attachments";

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

console.log("✓ 견적서 첨부 판정 통과");
