/**
 * 공고문 파생 규칙 검증 (DB 불필요) — npx tsx gian-notice.test.ts
 */
import assert from "node:assert";
import { buildNotice, isConcreteSchedule, josa } from "./src/lib/gian/notice";

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
assert.equal(work.rows[3].v, "품의-2026-0007 (2026-07-28 결재 완료)");
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
