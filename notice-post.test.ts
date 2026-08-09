/**
 * 공지문 자동완성 순수 로직 검증 — `npx tsx notice-post.test.ts` (DB 불필요)
 * 카탈로그 정합성 + 공고 호수 유도 + 개요 표 수정칸 왕복.
 */
import assert from "node:assert/strict";
import {
  MAX_NOTICE_PHOTOS,
  NOTICE_CATEGORIES,
  NOTICE_TYPES,
  draftPlainText,
  itemsToText,
  noticePhotos,
  noticeTypeOf,
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

// --- 사진대지 배치 입력 — 상한·mime·죽은 캡션 키 ---
const atts = [
  { id: "a", mime: "image/webp" },
  { id: "b", mime: "application/pdf" }, // 종이에 못 찍는다 — 제외
  { id: "c", mime: "image/jpeg" },
  { id: "d", mime: "image/png" },
  { id: "e", mime: "image/webp" },
  { id: "f", mime: "image/webp" }, // 5번째 이미지 — 상한 4장에 잘린다
];
const rows = noticePhotos(atts, { a: " 보수 전 ", dead: "삭제된 사진", c: "" });
assert.equal(rows.length, MAX_NOTICE_PHOTOS);
assert.deepEqual(rows.map((r) => r.id), ["a", "c", "d", "e"]);
assert.equal(rows[0].caption, "보수 전"); // trim
assert.equal(rows[1].caption, ""); // 캡션 없음 → 캡션 칸 미생성 신호
assert.ok(!rows.some((r) => r.id === "dead"), "죽은 캡션 키는 행이 되지 않는다");
assert.deepEqual(noticePhotos([], { a: "x" }), [], "사진 없으면 박스도 없다");

console.log("notice-post.test.ts 통과");
