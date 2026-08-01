/**
 * 공고문 파생 규칙 검증 (DB 불필요) — npx tsx gian-notice.test.ts
 */
import assert from "node:assert";
import {
  vagueScheduleLine,
  buildNotice,
  isConcreteSchedule,
  josa,
  mergePlaces,
  parseNoticeRow,
  readNoticeMark,
  splitPlaces,
  DEFAULT_PLACES,
  DEFAULT_POST_TO,
} from "./src/lib/gian/notice";
import type { GianDraft } from "./src/lib/gian/claude";

const at = new Date("2026-07-28T01:00:00Z"); // KST 2026-07-28 10:00
const form = {
  work: "승강기 와이어로프 교체 공사",
  location: "101동 승강기",
  why: "정기 점검 결과 마모 확인",
  schedule: "2026. 08. 05. ~ 08. 06.",
};

// 조사: 받침 있으면 을, 없으면 를 (한글이 아니면 를)
assert.equal(josa("점검", "을", "를"), "을");
assert.equal(josa("공사", "을", "를"), "를");
assert.equal(josa("CCTV", "을", "를"), "를");

// 공사(예산 있음) — 공사 문구 + 통행 제한 유의사항
const work = buildNotice({ form, docType: "ltp_work", docNo: "품의-2026-0007", approvedAt: at });
assert.equal(work.title, "승강기 와이어로프 교체 공사 시행 안내");
assert.equal(work.postFrom, "2026-07-28");
assert.equal(work.rows[0].k, "공사일자");
assert.equal(work.rows[0].v, form.schedule);
assert.equal(work.rows[0].red, true); // 일자는 적색 강조
assert.equal(work.rows[3].v, "품의-2026-0007 (2026년 7월 28일 결재 완료)");
assert.ok(work.notes.some((n) => n.text.includes("추진 사유")));
assert.ok(work.notes.some((n) => n.text.includes("통행 및 주차")));

// 예산 없는 기안(점검 안내 등) — 공사 문구·통행 제한은 오탐이므로 빠진다
const gian = buildNotice({
  form: { work: "소방시설 정기점검 안내", location: "전 동", why: "", schedule: "" },
  docType: "gian",
  docNo: "기안-2026-0002",
  approvedAt: at,
});
assert.equal(gian.title, "소방시설 정기점검 안내"); // "안내"로 끝나면 중복 안 붙임
assert.equal(gian.rows[0].k, "시행일자");
assert.equal(gian.rows[0].v, "(추후 공지)");
assert.ok(!gian.notes.some((n) => n.text.includes("통행 및 주차")));
assert.ok(!gian.notes.some((n) => n.text.includes("추진 사유"))); // 사유 미입력이면 생략
assert.ok(gian.notes.some((n) => n.red)); // 일정 변경 고지는 항상

console.log("✓ gian-notice 규칙 통과");

// ── 게시 전 일정 확정 판정 ──
assert.equal(isConcreteSchedule("2026년 8월 10일(월) ~ 8월 14일(금)"), true);
assert.equal(isConcreteSchedule("2026-08-10"), true);
assert.equal(isConcreteSchedule("8월 중"), false);
assert.equal(isConcreteSchedule("(추후 공지)"), false);
assert.equal(isConcreteSchedule(""), false);
console.log("✓ 일정 확정 판정 통과");

// ── 게시장소: 문자열 하나로 저장하고 체크 상태를 되돌린다 ──
// 새로 만든 공고문의 기본값이 그대로 체크로 돌아와야 한다
assert.equal(work.place, DEFAULT_PLACES.join(", "));
assert.equal(work.postTo, DEFAULT_POST_TO);
assert.deepEqual(splitPlaces(work.place).checked, DEFAULT_PLACES);
assert.equal(splitPlaces(work.place).custom, "");
// 후보에 없는 곳은 직접 입력칸으로 — 저장했다 열면 사라지는 일이 없어야 한다
assert.deepEqual(splitPlaces("승강기, 지하주차장 입구"), {
  checked: ["승강기"],
  custom: "지하주차장 입구",
});
assert.deepEqual(splitPlaces("노인정, 어린이집"), {
  checked: [],
  custom: "노인정, 어린이집",
});
// 공백·빈 항목이 섞여도 깨지지 않는다
assert.deepEqual(splitPlaces("  승강기 ,, 게시판 ,").checked, [
  "승강기",
  "게시판",
]);
assert.deepEqual(splitPlaces(""), { checked: [], custom: "" });

// ── 저장: 체크 + 직접 입력 → place 문자열 ──
// 순서는 체크한 순서가 아니라 후보 목록 순서 — 저장할 때마다 인쇄물이 흔들리면 안 된다
assert.deepEqual(mergePlaces(["게시판", "승강기"], ""), ["승강기", "게시판"]);
assert.deepEqual(mergePlaces(["동 출입구", "게시판"], ""), [
  "게시판",
  "동 출입구",
]);
// 직접 입력은 체크 뒤에 붙고, 쉼표로 여러 곳을 받는다
assert.deepEqual(mergePlaces(["승강기"], "지하주차장 입구, 노인정"), [
  "승강기",
  "지하주차장 입구",
  "노인정",
]);
// 후보에 없는 값이 places로 들어와도 무시한다(폼을 조작해도 임의 값이 안 들어간다)
assert.deepEqual(mergePlaces(["승강기", "아무거나"], ""), ["승강기"]);
// 체크한 곳을 직접 입력에 또 적어도 중복되지 않는다
assert.deepEqual(mergePlaces(["승강기"], "승강기, 노인정"), ["승강기", "노인정"]);
assert.deepEqual(mergePlaces(["승강기"], "노인정, 노인정"), ["승강기", "노인정"]);
// 아무것도 안 고르면 빈 배열 — 호출부가 거부한다
assert.deepEqual(mergePlaces([], "  ,  "), []);

// 저장 → 다시 열기 왕복이 값을 잃지 않는다
const round = mergePlaces(["승강기", "게시판"], "지하주차장 입구").join(", ");
assert.deepEqual(splitPlaces(round), {
  checked: ["승강기", "게시판"],
  custom: "지하주차장 입구",
});
console.log("✓ 게시장소 왕복 통과");

// ── 공고문 본문 수정: 편집칸 텍스트 ↔ 공고문 항목 ──
assert.deepEqual(parseNoticeRow("공 사 일 자: 8월 14일"), {
  k: "공 사 일 자",
  v: "8월 14일",
  red: false,
});
// 줄 앞 *는 빨간 글씨 표시 — 떼고 저장한다
assert.deepEqual(parseNoticeRow("*공 사 일 자: 8월 14일"), {
  k: "공 사 일 자",
  v: "8월 14일",
  red: true,
});
// 값 안의 콜론은 값에 남는다(시각 표기 "09:00~18:00")
assert.deepEqual(parseNoticeRow("작업시간: 09:00~18:00"), {
  k: "작업시간",
  v: "09:00~18:00",
  red: false,
});
// 콜론이 없으면 라벨만 있는 줄
assert.deepEqual(parseNoticeRow("추후 공지"), { k: "추후 공지", v: "", red: false });
assert.deepEqual(readNoticeMark("* 일정은 변경될 수 있습니다."), {
  text: "일정은 변경될 수 있습니다.",
  red: true,
});
// 화면에 뿌린 문자열을 그대로 다시 파싱해도 같은 값 — 왕복이 값을 잃지 않는다
const row = { k: "공 사 일 자", v: "8월 14일", red: true };
assert.deepEqual(parseNoticeRow(`${row.red ? "*" : ""}${row.k}: ${row.v}`), row);
console.log("✓ 공고문 본문 수정 왕복 통과");

// ── 공고문은 결재된 본문(meta.draft)을 싣는다 ──
// 입주민이 읽는 건 입력 키워드("LED 교체")가 아니라 결재가 끝난 그 문장이어야 한다.
const kw = {
  work: "LED 교체",
  location: "지하주차장",
  why: "어두움",
  schedule: "2026년 8월 12일(수)",
};
const draft: GianDraft = {
  title: "지하주차장 LED 등기구 교체공사 지출품의의 건",
  legalBasis: ["가. 공동주택관리법 시행령 제19조"],
  sections: [
    {
      heading: "품의목적",
      lines: [
        "가. 지하주차장 내 노후 형광등의 잦은 고장 및 침침함 해소",
        "나. 고효율 LED 조명 교체를 통한 공용전기료 절감",
      ],
    },
    {
      heading: "사업 및 지출개요",
      lines: [
        "가. 공 사 명: 지하주차장 노후 등기구 LED 교체 공사",
        "나. 공사위치: 지하주차장 1~2층 전구역",
        "다. 소요예산: 금 4,500,000원 (VAT 포함)",
      ],
    },
    { heading: "추진일정", lines: ["가. 공사시행: 2026년 ○월 ○일 ~ ○월 ○일"] },
  ],
  attachments: [],
  legalNotices: [],
  needsClarification: [],
};
const base = { docType: "pumui" as const, docNo: "품의-2026-0009", approvedAt: at };
const vOf = (n: ReturnType<typeof buildNotice>, k: string) =>
  n.rows.find((r) => r.k === k)?.v ?? "";

const fromDraft = buildNotice({ form: kw, draft, ...base });
// 라벨은 "공 사 명"처럼 자간이 벌어져 온다 — 공백을 지우고 맞춰야 잡힌다
assert.equal(vOf(fromDraft, "공사내용"), "지하주차장 노후 등기구 LED 교체 공사");
assert.equal(vOf(fromDraft, "공사위치"), "지하주차장 1~2층 전구역");
assert.equal(fromDraft.title, "지하주차장 노후 등기구 LED 교체 공사 시행 안내");
assert.ok(fromDraft.intro.includes("지하주차장 노후 등기구 LED 교체 공사를"));
// 사유는 목적 절의 개조식 항목에서 "가." 기호를 떼고 이어 붙인다
assert.equal(
  fromDraft.notes[0].text,
  "추진 사유: 지하주차장 내 노후 형광등의 잦은 고장 및 침침함 해소 / 고효율 LED 조명 교체를 통한 공용전기료 절감",
);
// 일정만은 초안을 안 본다 — 초안 일정은 "○월 ○일"이라 게시물에 실리면 안 된다
assert.equal(vOf(fromDraft, "공사일자"), kw.schedule);

// 초안이 자리표시자만 가진 항목은 없는 값 — 원 입력으로 떨어진다
const placeholder = buildNotice({
  form: kw,
  draft: {
    ...draft,
    sections: [
      { heading: "품의목적", lines: ["가. (입력 필요)"] },
      { heading: "사업 및 지출개요", lines: ["가. 공 사 명: ○○ 공사"] },
    ],
  },
  ...base,
});
assert.equal(vOf(placeholder, "공사내용"), "LED 교체");
assert.equal(placeholder.notes[0].text, "추진 사유: 어두움");

// 초안이 아예 없는 옛 문서도 그대로 — 위 work/gian 검증이 이미 이 경로다
const noDraft = buildNotice({ form: kw, ...base });
assert.equal(vOf(noDraft, "공사내용"), "LED 교체");
assert.equal(vOf(noDraft, "공사위치"), "지하주차장");
console.log("✓ 공고문이 결재된 본문을 싣는다");

// 초안 경고 카드는 진짜 빈칸(○)만 잡는다 — 미확정 표현은 정상 기록이라 경고 안 함
const sched = (lines: string[]) => [{ heading: "추진일정", lines }];
assert.equal(
  vagueScheduleLine(sched(["가. 계약체결: 2026년 8월 ○일"])),
  "가. 계약체결: 2026년 8월 ○일",
);
assert.equal(vagueScheduleLine(sched(["가. 계약체결: 2026년 8월 중"])), null);
assert.equal(vagueScheduleLine(sched(["결재 후 계약 체결 시 확정"])), null);
assert.equal(vagueScheduleLine([{ heading: "소요예산", lines: ["○○원"] }]), null);
console.log("✓ 일정 경고는 빈칸(○)만 잡는다");
