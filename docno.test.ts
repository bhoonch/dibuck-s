/**
 * 문서 채번 순수 로직 — `npx tsx docno.test.ts` (DB 불필요)
 *
 * 여기서 틀리면 공문서 번호가 중복되거나(치명), 특정 번호부터 채번이 영영 실패한다.
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { docNoHead, nextNumberIn } from "./src/lib/documents";

// ── 연도는 KST 기준 — UTC 서버의 12/31 밤은 KST로 이미 새해다 ──
assert.equal(docNoHead("gian", new Date("2026-06-01T00:00:00+09:00")), "기안-2026-");
assert.equal(docNoHead("gian", new Date("2026-12-31T23:00:00Z")), "기안-2027-");
// UTC 자정 직전(= KST 오전)도 그해 그대로
assert.equal(docNoHead("approval", new Date("2026-01-01T01:00:00+09:00")), "품의-2026-");
// 모르는 타입은 "문서" 접두어
assert.equal(docNoHead("unknown", new Date("2026-06-01T00:00:00+09:00")), "문서-2026-");

// ── 다음 번호는 문자열 정렬이 아니라 숫자 최대값 + 1 ──
const head = "기안-2026-";
assert.equal(nextNumberIn([], head), "기안-2026-0001");
assert.equal(nextNumberIn(["기안-2026-0009"], head), "기안-2026-0010");

// 9999 다음은 10000 — padStart는 자르지 않으므로 다섯 자리로 늘어난다
assert.equal(nextNumberIn(["기안-2026-9999"], head), "기안-2026-10000");

// 회귀: 10000이 있어도 문자열 정렬('9'>'1')에 속지 않고 10001을 준다.
// 예전 구현은 orderBy docNo desc라 9999를 최대로 보고 10000을 또 발급 → P2002 영구 실패.
assert.equal(
  nextNumberIn(["기안-2026-10000", "기안-2026-9999", "기안-2026-0001"], head),
  "기안-2026-10001",
);

// 숫자가 아닌 꼬리는 무시(수동 입력·이관 데이터 방어)
assert.equal(nextNumberIn(["기안-2026-임시", "기안-2026-0003"], head), "기안-2026-0004");

console.log("docno.test.ts — 모든 검증 통과");
