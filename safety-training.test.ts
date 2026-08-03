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
  dueMilestone,
  formatHours,
  halfLabel,
  halfOfKst,
  halfRange,
  mergeAttendees,
  parseHours,
  personProgress,
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
  assert.ok(t.courses.length > 0, `${t.key} courses 비어 있음`);
  for (const c of t.courses)
    assert.ok(courseTypeOf(c), `${t.key} courses에 없는 교육 종류: ${c}`);
}
// 교육 종류마다 고를 주제가 있어야 한다 — 전용 주제가 실수로 지워지면 여기서 잡힌다
for (const c of COURSE_TYPES) {
  const mine = TRAINING_TOPICS.filter((t) => t.courses.includes(c.key));
  assert.ok(mine.length >= 3, `${c.label} 주제 3종 미만`);
}
// 채용 시·관리감독자는 전용 주제(정기교육에 없는 것)가 있어야 한다
for (const key of ["new_hire", "supervisor"] as const)
  assert.ok(
    TRAINING_TOPICS.some((t) => t.courses.includes(key) && !t.courses.includes("regular")),
    `${key} 전용 주제 없음`,
  );
// 상반기 화면: 상반기 계절 주제가 맨 앞, 하반기 계절 주제가 맨 뒤
const h1Sorted = topicsForHalf(1);
assert.equal(h1Sorted[0].season, "h1");
assert.equal(h1Sorted[h1Sorted.length - 1].season, "h2");
assert.equal(topicsForHalf(2)[0].season, "h2");

// --- 교육시간 — 법정 누적(6h/12h) 판정이 이 파서에 걸려 있다 ---
assert.equal(parseHours(1), 1);
assert.equal(parseHours(1.5), 1.5);
assert.equal(parseHours("2"), 2);
// 옛 일지의 자유 텍스트도 읽어야 한다 — 못 읽으면 지난 증빙이 집계에서 빠진다
assert.equal(parseHours("1시간"), 1);
assert.equal(parseHours("1.5시간"), 1.5);
assert.equal(parseHours("총 3시간"), 3);
// 시간으로 볼 수 없는 값은 null — 0을 돌려주면 "0시간 이수"로 집계된다
assert.equal(parseHours(""), null);
assert.equal(parseHours("미정"), null);
assert.equal(parseHours(0), null);
assert.equal(parseHours(-1), null);
assert.equal(parseHours(undefined), null);
assert.equal(formatHours(1), "1시간");
assert.equal(formatHours(1.5), "1시간 30분");
assert.equal(formatHours(0.5), "30분");
assert.equal(formatHours("2시간"), "2시간");
// 못 읽는 값은 원문 그대로 — 옛 일지의 표기를 지우지 않는다
assert.equal(formatHours("미정"), "미정");
assert.equal(formatHours(undefined), "");

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

// --- 미이수 안내 회차 ---
// 임계값을 큰 것부터 보면 D-7에도 30이 먼저 걸려 마지막 안내가 안 나간다
assert.equal(dueMilestone(31), null, "아직 안내할 때 아님");
assert.equal(dueMilestone(30), 30);
assert.equal(dueMilestone(20), 30);
assert.equal(dueMilestone(8), 30);
assert.equal(dueMilestone(7), 7, "D-7 회차는 7이어야 한다");
assert.equal(dueMilestone(1), 7);
assert.equal(dueMilestone(0), 7, "마감 당일도 안내 대상");

// --- 인원별 이수 시간 + 이행 현황 집계 ---
const now = new Date("2026-08-03T10:00:00+09:00"); // 하반기
const 경리 = { id: "s1", name: "이경리", position: "사무", office: true };
const 기전 = { id: "s2", name: "박기전", position: "기전", office: false };
const roster = [경리, 기전];
const snap = (m: typeof 경리) => ({
  staffId: m.id,
  name: m.name,
  office: m.office,
});
const log = (date: string, hours: unknown, who: (typeof 경리)[]) => ({
  courseType: "regular" as const,
  date,
  hours,
  attendees: who.map(snap),
});

// 6시간을 한 번에 채운 사무직은 이수, 2시간만 받은 기전은 미이수(12시간 필요)
let p = personProgress(now, [log("2026-07-15", 6, [경리]), log("2026-07-20", 2, [기전])], roster);
assert.deepEqual(
  p.map((x) => [x.name, x.hours, x.required, x.done]),
  [
    ["이경리", 6, 6, true],
    ["박기전", 2, 12, false],
  ],
);
// 여러 회차는 누적된다 — 회차 수가 아니라 시간이 기준이다
p = personProgress(
  now,
  [log("2026-07-01", 6, [기전]), log("2026-08-01", 6, [기전])],
  roster,
);
assert.equal(p.find((x) => x.name === "박기전")?.done, true, "6+6=12 이수");
// 지난 반기 실시분은 이번 반기에 안 친다
assert.equal(
  personProgress(now, [log("2026-05-10", 12, [기전])], roster).find(
    (x) => x.name === "박기전",
  )?.hours,
  0,
);
// 옛 일지: staffId 없이 이름으로도 붙어야 한다(백필 못 한 동명이인 등)
assert.equal(
  personProgress(
    now,
    [
      {
        courseType: "regular",
        date: "2026-07-15",
        hours: "6시간",
        attendees: [{ name: "이경리", office: true }],
      },
    ],
    roster,
  ).find((x) => x.name === "이경리")?.hours,
  6,
);
// 시간을 못 읽는 일지는 0 — 적게 세는 쪽이라 "미이수"로 남는다(위반을 놓치지 않는다)
assert.equal(
  personProgress(now, [log("2026-07-15", "미정", [경리])], roster).find(
    (x) => x.name === "이경리",
  )?.hours,
  0,
);

// 직군 판정 = 그 직군 전원이 채웠는가. 한 명만 받아도 완료로 보이던 게 이 버그였다
const 경리2 = { id: "s3", name: "최경리", position: "사무", office: true };
const c = complianceOf(now, [log("2026-07-15", 6, [경리])], [경리, 경리2, 기전]);
assert.equal(c.regularOffice, false, "사무직 2명 중 1명만 이수 → 미완료");
assert.equal(c.regularField, false);
assert.deepEqual(c.half, { year: 2026, half: 2 });
assert.equal(
  complianceOf(now, [log("2026-07-15", 6, [경리, 경리2])], [경리, 경리2]).regularOffice,
  true,
  "사무직 전원 6시간 → 완료",
);
// 관리감독자는 대상이 소장 한 명이라 실시 여부로만 본다
const supLog = {
  courseType: "supervisor" as const,
  date: "2025-11-01",
  hours: 16,
  attendees: [snap(경리)],
};
assert.equal(complianceOf(now, [supLog], roster).supervisor, false, "작년 실시분");
assert.equal(
  complianceOf(now, [{ ...supLog, date: "2026-03-01" }], roster).supervisor,
  true,
);
// 사무직 직원이 없으면 판정 대상 아님(null) — "미실시" 경고를 잘못 띄우면 안 된다
const fieldOnly = complianceOf(now, [], [기전]);
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

// 수정 왕복에서 신원(staffId·office)이 살아남아야 한다 —
// 여기가 깨지면 일지를 한 번 수정할 때마다 인원별 이수 집계에서 사람이 사라진다
const snapped = [
  { staffId: "s1", name: "박기전", position: "기전", office: false },
  { staffId: "s2", name: "이경리", position: "사무", office: true },
];
assert.deepEqual(
  mergeAttendees(textToAttendees(attendeesToText(snapped)), snapped),
  snapped,
);
// 직종을 고쳐도 staffId는 유지되고, office는 스냅샷 값이 이긴다(파서는 추정만 한다)
assert.deepEqual(mergeAttendees(textToAttendees("이경리, 기타"), snapped), [
  { staffId: "s2", name: "이경리", position: "기타", office: true },
]);
// 수정칸에서 새로 적은 이름은 명부에 없을 수 있다 — staffId 없이 그대로 둔다
assert.deepEqual(mergeAttendees(textToAttendees("신입, 경비"), snapped), [
  { name: "신입", position: "경비", office: false },
]);
// staffId 없는 옛 스냅샷과 합쳐도 undefined 키를 만들지 않는다(JSON에 쓰레기가 남는다)
assert.deepEqual(
  mergeAttendees(textToAttendees("한미화, 미화"), [
    { name: "한미화", position: "미화", office: false },
  ]),
  [{ name: "한미화", position: "미화", office: false }],
);

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
