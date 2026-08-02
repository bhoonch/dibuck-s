/**
 * 교육일지 순수 로직 검증 — `npx tsx safety-training.test.ts` (DB 불필요)
 * 카탈로그 정합성 + 반기 경계(KST) + 이행 현황 집계 + 수정칸 왕복 + purge 포함 여부.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  COURSE_TYPES,
  TRAINING_TOPICS,
  attendeesToText,
  complianceOf,
  courseTypeOf,
  daysToHalfEnd,
  draftPlainText,
  halfLabel,
  halfOfKst,
  halfRange,
  sectionsToText,
  textToAttendees,
  textToSections,
  topicsForHalf,
} from "./src/lib/safety-training";

// --- 카탈로그 정합성 ---
assert.equal(COURSE_TYPES.length, 3);
assert.equal(courseTypeOf("regular")?.label, "정기교육");
assert.equal(courseTypeOf("없는키"), undefined);
const keys = TRAINING_TOPICS.map((t) => t.key);
assert.equal(new Set(keys).size, keys.length, "주제 key 중복");
assert.ok(TRAINING_TOPICS.length >= 20, "주제 20종 이상");
for (const t of TRAINING_TOPICS) {
  assert.ok(t.label && t.hint, `${t.key} 필드 누락`);
  assert.ok(["h1", "h2", "all"].includes(t.season));
}
// 상반기 화면: 상반기 계절 주제가 맨 앞, 하반기 계절 주제가 맨 뒤
const h1Sorted = topicsForHalf(1);
assert.equal(h1Sorted[0].season, "h1");
assert.equal(h1Sorted[h1Sorted.length - 1].season, "h2");
assert.equal(topicsForHalf(2)[0].season, "h2");

// --- 반기 경계 — KST 기준. UTC로 읽으면 6/30 밤 교육이 하반기가 된다 ---
// 2026-06-30 23:59 KST (= 6/30 14:59 UTC) → 상반기
assert.deepEqual(halfOfKst(new Date("2026-06-30T14:59:00Z")), { year: 2026, half: 1 });
// 2026-07-01 00:00 KST (= 6/30 15:00 UTC) → 하반기
assert.deepEqual(halfOfKst(new Date("2026-06-30T15:00:00Z")), { year: 2026, half: 2 });
// 2026-01-01 00:00 KST (= 2025-12-31 15:00 UTC) → 이듬해 상반기
assert.deepEqual(halfOfKst(new Date("2025-12-31T15:00:00Z")), { year: 2026, half: 1 });
assert.equal(halfLabel({ year: 2026, half: 2 }), "2026년 하반기");
assert.deepEqual(halfRange({ year: 2026, half: 1 }), { start: "2026-01-01", end: "2026-06-30" });
assert.deepEqual(halfRange({ year: 2026, half: 2 }), { start: "2026-07-01", end: "2026-12-31" });
// 마감 당일 D-0, 하루 전 D-1
assert.equal(daysToHalfEnd(new Date("2026-06-30T00:00:00+09:00")), 0);
assert.equal(daysToHalfEnd(new Date("2026-06-29T00:00:00+09:00")), 1);
assert.equal(daysToHalfEnd(new Date("2026-12-31T09:00:00+09:00")), 0);

// --- 이행 현황 집계 ---
const now = new Date("2026-08-03T10:00:00+09:00"); // 하반기
const roster = [{ office: true }, { office: false }];
const officeLog = {
  courseType: "regular" as const,
  date: "2026-07-15",
  attendees: [{ office: true }],
};
const fieldLogLastHalf = {
  courseType: "regular" as const,
  date: "2026-05-10", // 상반기 실시분 — 이번 반기에 안 쳐야 한다
  attendees: [{ office: false }],
};
const supLogLastYear = {
  courseType: "supervisor" as const,
  date: "2025-11-01",
  attendees: [{ office: true }],
};
const c = complianceOf(now, [officeLog, fieldLogLastHalf, supLogLastYear], roster);
assert.equal(c.regularOffice, true, "사무직 참석 회차가 있으면 완료");
assert.equal(c.regularField, false, "지난 반기 실시분은 이번 반기에 안 친다");
assert.equal(c.supervisor, false, "작년 관리감독자 교육은 올해에 안 친다");
assert.deepEqual(c.half, { year: 2026, half: 2 });
// 올해 관리감독자 실시 → true
assert.equal(
  complianceOf(now, [{ ...supLogLastYear, date: "2026-03-01" }], roster).supervisor,
  true,
);
// 사무직 직원이 없으면 판정 대상 아님(null) — "미실시" 경고를 잘못 띄우면 안 된다
const fieldOnly = complianceOf(now, [], [{ office: false }]);
assert.equal(fieldOnly.regularOffice, null);
assert.equal(fieldOnly.regularField, false);

// --- 수정칸 왕복 ---
const sections = [
  { heading: "폭염 대비 온열질환 예방", lines: ["가. 물·그늘·휴식을 지킨다.", "나. 증상 시 즉시 중단한다."] },
  { heading: "전기 작업 안전", lines: ["가. 차단기를 내리고 검전한다."] },
];
assert.deepEqual(textToSections(sectionsToText(sections)), sections);
assert.deepEqual(textToSections("한 줄뿐"), [{ heading: "한 줄뿐", lines: [] }]);

const attendees = [
  { name: "박기전", position: "기전", office: false },
  { name: "이경리", position: "사무", office: true },
];
assert.deepEqual(textToAttendees(attendeesToText(attendees)), attendees);
assert.deepEqual(textToAttendees("홍길동"), [
  { name: "홍길동", position: "기타", office: false },
]);

// --- 문서함 검색용 평문 ---
const plain = draftPlainText({ sections, closing: "질의응답", needsClarification: [] });
assert.ok(plain.includes("전기 작업 안전"));
assert.ok(plain.includes("가. 차단기를 내리고 검전한다."));

// --- 탈퇴 purge가 명부를 지우는지 — 코드 자체를 확인한다 (DB 없이) ---
const purgeSrc = readFileSync("./src/lib/tenant-deletion.ts", "utf8");
assert.ok(
  purgeSrc.includes("trainingStaff.deleteMany"),
  "purge에 TrainingStaff deleteMany가 없다",
);

console.log("safety-training.test.ts 통과");
