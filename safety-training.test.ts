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
  newHireMilestone,
  newHireOverdue,
  newHireProgress,
  parseExtTrainings,
  parseHours,
  personProgress,
  supervisorProgress,
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
// 반기를 인자로 지정하면 지난 반기도 집계된다 — 연간 보고서가 이 경로를 쓴다
p = personProgress(now, [log("2026-05-10", 12, [기전])], roster, { year: 2026, half: 1 });
assert.equal(p.find((x) => x.name === "박기전")?.done, true, "상반기 지정 집계");
// 다른 연도를 지정하면 올해 실시분은 안 잡힌다
assert.equal(
  personProgress(now, [log("2026-07-15", 6, [경리])], roster, { year: 2025, half: 2 }).find(
    (x) => x.name === "이경리",
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

// --- 관리감독자 (연 16시간 · 외부 이수 합산) ---
const 소장 = {
  id: "sv1",
  name: "김소장",
  position: "사무",
  office: true,
  supervisor: true,
  extTrainings: [
    { date: "2026-03-05", org: "안전보건교육원", hours: 12 },
    { date: "2025-03-05", org: "안전보건교육원", hours: 16 }, // 작년 — 올해에 안 친다
  ],
};
// 관리감독자는 반기 정기교육 집계에서 빠진다 — 두면 소장이 늘 "미이수"로 찍힌다
assert.deepEqual(
  personProgress(now, [log("2026-07-15", 6, [경리])], [경리, 소장]).map((x) => x.name),
  ["이경리"],
);
// 연 16시간 = 앱 일지 + 외부 이수 합산. 연도 밖 외부 이수는 안 친다
const svLog16 = {
  courseType: "supervisor" as const,
  date: "2026-06-01",
  hours: 4,
  attendees: [snap(소장 as never)],
};
let sv = supervisorProgress(2026, [svLog16], [경리, 소장]);
assert.deepEqual(
  sv.map((x) => [x.name, x.hours, x.extHours, x.done]),
  [["김소장", 16, 12, true]],
);
// 외부 이수만으로는 12시간 — 미이수
sv = supervisorProgress(2026, [], [소장]);
assert.deepEqual([sv[0].hours, sv[0].done], [12, false]);
// 관리감독자 표시가 없는 사람은 대상이 아니다
assert.deepEqual(supervisorProgress(2026, [], [경리, 기전]), []);

// complianceOf: 관리감독자가 표시돼 있으면 16시간 누적으로 판정한다
assert.equal(
  complianceOf(now, [{ ...svLog16, date: "2026-03-01" }], [소장]).supervisor,
  true,
  "4h 일지 + 12h 외부 = 16h 이수",
);
assert.equal(
  complianceOf(now, [], [소장]).supervisor,
  false,
  "외부 12h뿐 — 16h 미달",
);
// 아무도 표시하지 않은 단지는 예전 기준(실시 여부)으로 떨어진다
assert.equal(
  complianceOf(now, [{ ...svLog16, date: "2026-03-01" }], roster).supervisor,
  true,
);

// 외부 이수 파서 — 모양이 어긋난 항목은 조용히 버린다(집계를 깨뜨리지 않는다)
assert.deepEqual(parseExtTrainings(null), []);
assert.deepEqual(parseExtTrainings("문자열"), []);
assert.deepEqual(
  parseExtTrainings([
    { date: "2026-03-05", org: "기관", hours: 8 },
    { date: "잘못된날짜", org: "기관", hours: 8 },
    { date: "2026-03-06", org: "기관", hours: 0 },
    { date: "2026-03-07", hours: 8 },
  ]),
  [{ date: "2026-03-05", org: "기관", hours: 8 }],
);

// --- 채용 시 교육 (개인별 1회성) ---
const 신입 = {
  id: "s4",
  name: "정신입",
  position: "경비",
  office: false,
  hiredAt: new Date("2026-07-20T00:00:00+09:00"),
};
const nhLog = (date: string, hours: unknown, who: { id: string; name: string }[]) => ({
  courseType: "new_hire" as const,
  date,
  hours,
  attendees: who.map((m) => ({ staffId: m.id, name: m.name, office: false })),
});

// 입사일 없는 사람은 결과에 아예 없다 — 도입 전 입사자를 미이수로 띄우면 알림이 죽는다
assert.deepEqual(newHireProgress(now, [], [경리, 기전]), []);
// 8시간 미만이면 미이수, 채우면 이수
const nh = newHireProgress(now, [nhLog("2026-07-21", 4, [신입])], [기전, 신입]);
assert.deepEqual(
  nh.map((x) => [x.name, x.hours, x.required, x.done]),
  [["정신입", 4, 8, false]],
);
assert.equal(
  newHireProgress(now, [nhLog("2026-07-21", 8, [신입])], [신입])[0].done,
  true,
);
// 여러 회차 누적
assert.equal(
  newHireProgress(
    now,
    [nhLog("2026-07-21", 4, [신입]), nhLog("2026-07-22", 4, [신입])],
    [신입],
  )[0].done,
  true,
);
// 입사 전 교육은 안 친다 — 전 직장에서 받은 교육을 이수로 치는 꼴이 된다
assert.equal(
  newHireProgress(now, [nhLog("2026-07-19", 8, [신입])], [신입])[0].hours,
  0,
);
// 정기교육 시간은 채용 시 교육에 합산하지 않는다(감면 규정은 코드가 판단하지 않는다)
assert.equal(
  newHireProgress(now, [log("2026-07-21", 8, [경리])], [
    { ...신입, id: 경리.id, name: 경리.name },
  ])[0].hours,
  0,
);
// 입사 후 경과일 — 2026-07-20 입사, 기준 2026-08-03 → 14일
assert.equal(newHireProgress(now, [], [신입])[0].daysSinceHire, 14);
// 안내 대상은 유예(7일)를 넘긴 미이수자만 — 입사 당일부터 경고하면 매번 뜬다
assert.deepEqual(
  newHireOverdue(newHireProgress(now, [], [신입])).map((p) => p.name),
  ["정신입"],
);
const 오늘입사 = { ...신입, id: "s5", name: "오늘입사", hiredAt: now };
assert.deepEqual(newHireOverdue(newHireProgress(now, [], [오늘입사])), []);
// 이수했으면 유예를 넘겨도 대상이 아니다
assert.deepEqual(
  newHireOverdue(newHireProgress(now, [nhLog("2026-07-21", 8, [신입])], [신입])),
  [],
);

// 안내 회차는 지날수록 급해지므로 큰 것부터 본다 — 뒤집으면 30일 회차가 안 나간다
assert.equal(newHireMilestone(6), null, "유예 안");
assert.equal(newHireMilestone(7), 7);
assert.equal(newHireMilestone(29), 7);
assert.equal(newHireMilestone(30), 30, "30일 지나면 두 번째 회차");
assert.equal(newHireMilestone(100), 30);

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
