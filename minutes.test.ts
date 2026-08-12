import assert from "node:assert/strict";
import {
  proposeAgenda, signTokenState, minutesHash, noticeDueYmd, signProgress,
  normalizeMinutesAgendas, quorum, voteCounts, toSpeech, maskName, sanitizeAiSuggestions,
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

// ── quorum: 영 제4조제3항(구성원) + 영 제14조제1항(과반수) ──
// 정원 10, 선출 9 → 3분의 2(7명) 이상 선출됐으므로 구성원은 선출 인원 9, 정족수 5
assert.deepEqual(quorum(10, 9, 7), {
  seats: 10, unfilled: 1, members: 9, required: 5, present: 7, absent: 2,
});
// 정원 10, 선출 6 → 3분의 2(7명) 미달이라 구성원은 정원 10으로 되돌아가 정족수 6
assert.deepEqual(quorum(10, 6, 5), {
  seats: 10, unfilled: 4, members: 10, required: 6, present: 5, absent: 1,
});
// 경계 — 정원 9의 3분의 2는 정확히 6명. 6명 선출은 "이상"이라 선출 인원이 구성원
assert.equal(quorum(9, 6, 6).members, 6);
assert.equal(quorum(9, 5, 5).members, 9);
// 규약 정원 미입력 → 선출 인원을 정원으로 본다(미선출 0)
assert.deepEqual(quorum(null, 7, 4), {
  seats: 7, unfilled: 0, members: 7, required: 4, present: 4, absent: 3,
});

// ── 표결 성명 — 준칙이 요구하는 찬성자·반대자·기권자 기록 ──
const roster = ["김회장", "이감사", "박서울"];
const withVotes = normalizeMinutesAgendas(
  [
    { order: 1, title: "x", discussion: [{ speaker: "101동 김회장", text: "원안 찬성" }],
      decision: "가결", votes: { for: ["김회장", "박서울"], against: ["이감사"], abstain: [] } },
    { order: 2, title: "x", discussion: [], decision: "없음" },
  ],
  anchor, roster,
);
assert.ok("agendas" in withVotes);
if ("agendas" in withVotes) {
  const a = withVotes.agendas[0];
  assert.deepEqual(voteCounts(a), { for: 2, against: 1, abstain: 0 });
  // 성명이 있으면 숫자는 저장하지 않는다 — 두 벌이 어긋날 자리를 없앤다
  assert.equal(a.votesFor, null);
  assert.equal(a.votesAgainst, null);
  assert.deepEqual(a.discussion[0], { speaker: "101동 김회장", text: "원안 찬성" });
  // 표결 없는 보고 안건은 votes를 남기지 않는다
  assert.equal(withVotes.agendas[1].votes, undefined);
}

// 명부 밖 이름 거부 — LLM이든 클라이언트든 없는 사람을 표결에 넣을 수 없다
assert.deepEqual(
  normalizeMinutesAgendas(
    [
      { order: 1, title: "x", discussion: [], decision: "가결", votes: { for: ["없는사람"], against: [], abstain: [] } },
      { order: 2, title: "x", discussion: [], decision: "없음" },
    ],
    anchor, roster,
  ),
  { fail: "voter" },
);

// 한 사람이 찬성이면서 반대 — 중복 배정 거부
assert.deepEqual(
  normalizeMinutesAgendas(
    [
      { order: 1, title: "x", discussion: [], decision: "가결", votes: { for: ["김회장"], against: ["김회장"], abstain: [] } },
      { order: 2, title: "x", discussion: [], decision: "없음" },
    ],
    anchor, roster,
  ),
  { fail: "voter" },
);

// 레거시 회의록 — 발언자 없는 string과 숫자 표결이 그대로 살아 있다
assert.deepEqual(toSpeech("발언만 있음"), { speaker: "", text: "발언만 있음" });
assert.deepEqual(
  voteCounts({ order: 1, title: "x", discussion: [], decision: "가결", votesFor: 6, votesAgainst: 2 }),
  { for: 6, against: 2, abstain: 0 },
);

// ── 견적 비교표 — 업체명 없는 행은 버리고, 금액은 0 이상 또는 null만 ──
const withQuotes = normalizeMinutesAgendas(
  [
    { order: 1, title: "x", discussion: [], decision: "가결",
      quotes: [
        { vendor: "(주)한빛방수", amount: 11800000, note: "최저가" },
        { vendor: "  ", amount: 999, note: "빈 행" },
        { vendor: "대성건설", amount: null, note: "" },
      ] },
    { order: 2, title: "x", discussion: [], decision: "없음" },
  ],
  anchor, roster,
);
assert.ok("agendas" in withQuotes);
if ("agendas" in withQuotes) {
  assert.deepEqual(withQuotes.agendas[0].quotes, [
    { vendor: "(주)한빛방수", amount: 11800000, note: "최저가" },
    { vendor: "대성건설", amount: null, note: "" },
  ]);
  assert.equal(withQuotes.agendas[1].quotes, undefined); // 없으면 필드 자체가 없다
}
assert.deepEqual(
  normalizeMinutesAgendas(
    [
      { order: 1, title: "x", discussion: [], decision: "가결",
        quotes: [{ vendor: "업체", amount: -1, note: "" }] },
      { order: 2, title: "x", discussion: [], decision: "없음" },
    ],
    anchor, roster,
  ),
  { fail: "quote" }, // 음수 금액 거부
);

// ── sanitizeAiSuggestions: AI 표결·견적 제안 필터 — 위반 제안만 떨구고 초안은 살린다 ──
const aiIn: Parameters<typeof sanitizeAiSuggestions>[0] = [
  { order: 1, title: "x", discussion: [], decision: "가결",
    // 명부 밖 이름·중복(김회장이 두 칸)은 떨군다. 유효분만 남는다
    votes: { for: ["김회장", "외부인"], against: ["박서울", "김회장"], abstain: [] },
    quotes: [
      { vendor: "한빛방수", amount: 48000000, note: "최저가" },
      { vendor: "", amount: 1, note: "업체명 없음" },
      { vendor: "대성건설", amount: -5, note: "음수 금액" },
    ],
    votesFor: null, votesAgainst: null },
  // 의결 "없음"이면 표결 제안 자체를 버린다
  { order: 2, title: "x", discussion: [], decision: "없음",
    votes: { for: ["이감사"], against: [], abstain: [] },
    votesFor: null, votesAgainst: null },
  // 전부 명부 밖이면 votes를 남기지 않는다
  { order: 3, title: "x", discussion: [], decision: "가결",
    votes: { for: ["아무개"], against: [], abstain: [] },
    votesFor: null, votesAgainst: null },
];
const aiOut = sanitizeAiSuggestions(aiIn, roster);
assert.deepEqual(aiOut[0].votes, { for: ["김회장"], against: ["박서울"], abstain: [] });
assert.deepEqual(aiOut[0].quotes, [
  { vendor: "한빛방수", amount: 48000000, note: "최저가" },
  { vendor: "대성건설", amount: null, note: "음수 금액" }, // 이상한 금액은 null로
]);
assert.equal(aiOut[1].votes, undefined);
assert.equal(aiOut[2].votes, undefined);
assert.equal(aiOut[2].quotes, undefined);
// 필터 결과는 normalize(명부 대조)를 그대로 통과해야 한다 — 두 관문이 어긋나면 안 된다
assert.ok("agendas" in normalizeMinutesAgendas(
  [aiOut[0], aiOut[1], { ...aiOut[2], order: 3 }].map((a, i) => ({ ...a, order: i + 1 })),
  anchor.length === 2
    ? [...anchor, { order: 3, title: "x" }]
    : anchor,
  roster,
));

// ── maskName: 공개용 성명 비식별(준칙 제43조⑤) — 성만 남긴다 ──
assert.equal(maskName("박일동"), "박○○");
assert.equal(maskName("남궁일동"), "남○○○"); // 복성 판별 안 함 — 더 가려지는 쪽
assert.equal(maskName("김구"), "김○");
assert.equal(maskName("구"), "구"); // 외자는 가릴 나머지가 없다

console.log("minutes.test.ts OK");
