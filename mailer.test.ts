/** 메일 HTML 이스케이프 검증 — `npx tsx mailer.test.ts` (DB·SMTP 불필요) */
import assert from "node:assert/strict";
import { escapeHtml } from "./src/lib/mailer";

// 기안 제목에 태그를 넣어도 외부 결재자 메일에서 태그로 살아나면 안 된다
assert.equal(
  escapeHtml(`<a href="https://evil.example">누르세요</a>`),
  "&lt;a href=&quot;https://evil.example&quot;&gt;누르세요&lt;/a&gt;",
);
// & 를 먼저 바꿔야 한다 — 순서가 틀리면 &lt; 가 &amp;lt; 로 이중 이스케이프된다
assert.equal(escapeHtml("A&B <아파트>"), "A&amp;B &lt;아파트&gt;");
// 따옴표는 속성 문맥(href="...")을 깨고 나오는 통로라 둘 다 막는다
assert.equal(escapeHtml(`'단지' "이름"`), "&#39;단지&#39; &quot;이름&quot;");
// 평범한 한국어 이름·제목은 그대로 나간다
assert.equal(escapeHtml("놀이터 보수공사 품의"), "놀이터 보수공사 품의");

console.log("mailer.test.ts — 이스케이프 검증 통과");
