import assert from "node:assert/strict";
import {
  proposeAgenda, signTokenState, minutesHash, noticeDueYmd, signProgress,
  normalizeMinutesAgendas,
} from "./src/lib/minutes";

// ── proposeAgenda: 미완료 의결 → 이행 보고 안건, 순서는 이어 붙는다 ──
const proposed = proposeAgenda(
  [{ id: "r1", title: "승강기 교체 견적 재취합", meetingDocNo: "회의-2026-0003" }],
  1, // 기존 안건 수 — 제안 안건은 그 뒤 번호
);
assert.equal(proposed[0].order, 2);
assert.equal(proposed[0].fromResolutionId, "r1");
assert.ok(proposed[0].title.includes("승강기 교체 견적 재취합"));
assert.ok(proposed[0].title.includes("이행 보고"));
assert.deepEqual(proposeAgenda([], 0), []);

// ── signTokenState: 병렬 서명 — 완성(final) 문서에서만 유효, fail-closed ──
const future = new Date(Date.now() + 3600_000);
const past = new Date(Date.now() - 1);
const step = { status: "pending", token: "t", tokenExpiresAt: future };
assert.equal(signTokenState(step, "final"), "valid");
assert.equal(signTokenState(step, "draft"), "invalid"); // 완성 전 서명 불가
assert.equal(signTokenState(step, "void"), "invalid");
assert.equal(signTokenState(step, undefined), "invalid");
assert.equal(signTokenState(null, "final"), "invalid");
assert.equal(signTokenState({ ...step, token: null }, "final"), "invalid");
assert.equal(signTokenState({ ...step, tokenExpiresAt: past }, "final"), "expired");
assert.equal(signTokenState({ ...step, status: "approved" }, "final"), "done");
assert.equal(signTokenState({ ...step, status: "waiting" }, "final"), "invalid");

// ── minutesHash: 회의록 내용 해시 — 서명 뒤 파생(noticeDocId)이 붙어도 불변 ──
const meta = {
  meetingNo: 4, meetingAt: "2026-08-20 14:00", place: "관리동 회의실",
  noticeDays: 5,
  attendees: [{ role: "CHAIR", label: "입주자대표회장", name: "김회장", present: true }],
  agenda: [{ order: 1, title: "안건" }],
  minutes: [{ order: 1, title: "안건", discussion: ["논의"], decision: "가결" as const, votesFor: 5, votesAgainst: 1 }],
};
const h1 = minutesHash("제4차 회의록", meta);
assert.equal(h1.length, 64);
assert.equal(h1, minutesHash("제4차 회의록", { ...meta, noticeDocId: "d9" })); // 파생 역링크는 해시 밖
assert.notEqual(h1, minutesHash("제4차 회의록", { ...meta, place: "다른 곳" }));

// ── noticeDueYmd: 통지 시한 = 회의일 - noticeDays ──
assert.equal(noticeDueYmd("2026-08-20 14:00", 5), "2026-08-15");
assert.equal(noticeDueYmd("2026-01-03 10:00", 5), "2025-12-29"); // 연 경계

// ── signProgress: 전원 서명 판정 ──
assert.deepEqual(
  signProgress([{ status: "approved" }, { status: "pending" }]),
  { signed: 1, total: 2, allSigned: false },
);
assert.deepEqual(signProgress([{ status: "approved" }]), { signed: 1, total: 1, allSigned: true });
assert.deepEqual(signProgress([]), { signed: 0, total: 0, allSigned: false }); // 0명 = 완료 아님

// ── normalizeMinutesAgendas: 안건 앵커 검증 — saveMinutesDraft·generateMinutes 공용 ──
const anchor = [{ order: 1, title: "승강기 재계약 건" }, { order: 2, title: "CCTV 증설 안건" }];

// 개수 불일치 거부(모델이 안건을 빼거나 더한 경우)
assert.deepEqual(
  normalizeMinutesAgendas([{ order: 1, title: "승강기 재계약 건", discussion: [], decision: "없음", votesFor: null, votesAgainst: null }], anchor),
  { fail: "count" },
);

// order 불일치 거부(개수는 맞지만 안건이 안 걸림 — 예: order 1,1)
assert.deepEqual(
  normalizeMinutesAgendas(
    [
      { order: 1, title: "승강기 재계약 건", discussion: [], decision: "없음", votesFor: null, votesAgainst: null },
      { order: 1, title: "승강기 재계약 건", discussion: [], decision: "없음", votesFor: null, votesAgainst: null },
    ],
    anchor,
  ),
  { fail: "duplicate" },
);

// 제목 정규화 — 모델이 제목을 살짝 바꿔도 앵커 제목(meta.agenda)이 이긴다
const normalized = normalizeMinutesAgendas(
  [
    { order: 1, title: "승강기 재계약(안)", discussion: ["표결 진행"], decision: "가결", votesFor: 6, votesAgainst: 2 },
    { order: 2, title: "CCTV 증설", discussion: [], decision: "없음", votesFor: null, votesAgainst: null },
  ],
  anchor,
);
assert.ok("agendas" in normalized);
if ("agendas" in normalized) {
  assert.equal(normalized.agendas[0].title, "승강기 재계약 건"); // 앵커 제목으로 되돌아감
  assert.equal(normalized.agendas[1].title, "CCTV 증설 안건");
}

// 의결·찬반 값 검증
assert.deepEqual(
  normalizeMinutesAgendas(
    [
      { order: 1, title: "x", discussion: [], decision: "가결", votesFor: -1, votesAgainst: 0 },
      { order: 2, title: "x", discussion: [], decision: "없음", votesFor: null, votesAgainst: null },
    ],
    anchor,
  ),
  { fail: "votes" },
);
assert.deepEqual(
  normalizeMinutesAgendas(
    [
      { order: 1, title: "x", discussion: [], decision: "찬성", votesFor: null, votesAgainst: null },
      { order: 2, title: "x", discussion: [], decision: "없음", votesFor: null, votesAgainst: null },
    ],
    anchor,
  ),
  { fail: "decision" },
);

console.log("minutes.test.ts OK");
