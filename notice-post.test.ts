/**
 * 공지문 자동완성 순수 로직 검증 — `npx tsx notice-post.test.ts` (DB 불필요)
 * 카탈로그 정합성 + 공고 호수 유도 + 개요 표 수정칸 왕복.
 */
import assert from "node:assert/strict";
import {
  NOTICE_CATEGORIES,
  NOTICE_TYPES,
  draftPlainText,
  itemsToText,
  noticeTypeOf,
  officialNoOf,
  textToItems,
} from "./src/lib/notice-catalog";

// --- 카탈로그 정합성 ---
const keys = NOTICE_TYPES.map((t) => t.key);
assert.equal(new Set(keys).size, keys.length, "유형 key 중복");
assert.ok(NOTICE_TYPES.length >= 25, "유형 25종 이상");
for (const t of NOTICE_TYPES) {
  assert.ok(t.label && t.category && t.hint, `${t.key} 필드 누락`);
  assert.ok(NOTICE_CATEGORIES.includes(t.category));
}
// 공고문 격은 공고 유형(회의·선출)과 자유 입력 토글뿐 — 나머지는 협조 안내문이다
assert.deepEqual(
  NOTICE_TYPES.filter((t) => t.kind === "official").map((t) => t.key),
  ["council", "election"],
);
assert.equal(noticeTypeOf("water_cut")?.label, "단수 안내");
assert.equal(noticeTypeOf("없는키"), undefined);

// --- 공고 호수 — 채번에서 유도, LLM이 짓지 않는다 ---
assert.equal(officialNoOf("공지-2026-0007", "행복아파트"), "행복아파트 공고 제2026-7호");
assert.equal(officialNoOf("공지-2026-0012", "행복아파트"), "행복아파트 공고 제2026-12호");
// 채번 전·형식 밖 값은 호수 없이 — 틀린 호수를 지어내지 않는다
assert.equal(officialNoOf(null, "행복아파트"), "행복아파트 공고");
assert.equal(officialNoOf("독촉-2026-0001", "행복아파트"), "행복아파트 공고");

// --- 개요 표 수정칸 왕복 — 값 속 콜론("10:00")은 구분자가 아니다 ---
const items = [
  { label: "단수 일시", value: "8월 10일(월) 10:00 ~ 16:00" },
  { label: "사유", value: "저수조 청소" },
];
assert.deepEqual(textToItems(itemsToText(items)), items);
assert.deepEqual(textToItems("라벨 없는 줄\n\n  "), [
  { label: "", value: "라벨 없는 줄" },
]);

// --- 문서함 검색용 평문 ---
const plain = draftPlainText({
  title: "단수 안내",
  intro: "안내드립니다.",
  items,
  bodyLines: ["물을 받아 두시기 바랍니다."],
  closing: "협조 부탁드립니다.",
  needsClarification: [],
});
assert.ok(plain.includes("단수 일시: 8월 10일(월) 10:00 ~ 16:00"));
assert.ok(plain.includes("물을 받아 두시기 바랍니다."));

console.log("notice-post.test.ts 통과");
