# 입대의 운영(회의록) 모듈 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 회의 준비(소집·안건)부터 회의록 작성(LLM 구조화)·전자서명·의결사항 공고·이행 추적까지 한 줄로 잇는 minutes 모듈을 만든다.

**Architecture:** 회의 하나 = Document(type "minutes") 하나가 생애주기를 관통한다(소집 draft → 회의록 초안 → [완성] 채번 후 불변). 의결사항만 별도 테이블 Resolution(완성 후에도 상태가 변한다). 서명은 기존 ApprovalStep 테이블을 **병렬 모드**로 재사용하고, 판정 순수 함수만 새로 쓴다. 소집 통지문·의결 공고문은 결정적 코드.

**Tech Stack:** Next.js 16 App Router, Prisma 7 + PostgreSQL(`db push`), Anthropic SDK(claude-sonnet-5, structured outputs), 기존 결재 토큰 엔진.

## Global Constraints

- **커밋·푸시는 태스크 끝마다 하지 않는다 — 사용자 지시를 기다린다** (프로젝트 규칙, 아래 태스크의 "커밋" 단계는 전부 "사용자 승인 대기"로 읽는다).
- 스키마 반영은 `npx prisma db push` (migrate dev 금지 — DB 리셋 요구). 반영 후 `npx prisma generate` + dev 서버 재시작.
- UI 문구에 '—' 연결 금지. 문장을 끊거나 줄바꿈.
- 법 해석은 코드가 하지 않는다 — "관리규약을 확인하세요" 안내만, 판정 없음.
- `ANTHROPIC_API_KEY` 없으면 LLM 생성만 "준비 중", 소집·서명·추적·공고 파생은 전부 돈다.
- 모듈 라우트 완성 전 `isActive: true` 금지 (체험 소진 규칙). 출시는 마지막 태스크에서만.
- 돈·상태 전이 함수는 자기 입구에서 "지금 할 차례인가"를 검사한다. 한 번만 일어나야 하는 일은 조건부 `updateMany`.
- 비트리비얼 순수 로직은 `npx tsx *.test.ts` (DB 불필요)로 굳힌다.
- 시드 이름·설명은 실제 동작과 일치(과장 금지).
- LLM 환각 금지: 입력에 없는 발언·수치·인명 생성 금지, "○월 ○일" 빈칸 표기 금지.

## 먼저 읽을 파일 (전 태스크 공통)

| 파일 | 가져올 것 |
|---|---|
| `AGENTS.md` | 전부 |
| `src/lib/documents.ts` | `createDocument`(numberOnSubmit)·`assignDocNo`·채번 규칙 |
| `src/app/(app)/modules/notice/actions.ts` | draft→완성 채번(`finalizeNoticePost`)·rateLimit·폐기 규칙 |
| `src/lib/gian/approval.ts` | 토큰 발급·`tokenState`·`reissueToken`·조건부 updateMany 패턴 |
| `src/app/approve/[token]/` | 공개 서명 화면·fail-closed |
| `src/lib/gian/rules.ts` | `ExternalApprover`(role CHAIR/AUDITOR/ETC, label, name) |
| `src/lib/gian/notice.ts` | `findNoticeFor`·`createNoticeFrom`·`NoticeDoc` 형태 |
| `src/components/gian-paper.tsx`, `notice-paper.tsx` | A4 괘선·PrintStyle |
| `src/app/(app)/modules/repairs/` | 최신 모듈 견본(가드·UploadState·홈 구성) |

---

### Task 0: 인쇄 문구 확정 (Phase 0 — 법령·서식)

**Files:**
- Create: 없음 (이 태스크의 산출물은 아래 "확정 문구"의 검증뿐)

서식에 실을 법 관련 문구는 아래 둘뿐이다. 조문 번호·고시 호수는 싣지 않는다(법 해석 경계).

- [ ] **Step 1: law.go.kr에서 두 문장의 사실 여부만 확인**

확정 문구(소집 통지문 하단):
> 본 회의는 공동주택관리법 및 관리규약에 따라 소집합니다.

확정 문구(회의록 화면·서명 요청 카드 안내 1줄):
> 관리규약이 정한 회의록 서명 방식을 확인하세요. 자필 서명이 필요한 단지는 인쇄해 서명란에 자필로 받으면 됩니다.

확인 방법: law.go.kr에서 공동주택관리법 제14조(입주자대표회의)·전자서명법 제3조 원문 조회. 위 문구가 원문과 어긋나면 문구를 보수적으로 줄인다(예: "공동주택관리법 및" 삭제). **문구를 늘리지 않는다.**

- [ ] **Step 2: 확인 결과를 이 계획 파일의 이 절에 한 줄로 기록**

---

### Task 1: Resolution 스키마 + 탈퇴 purge

**Files:**
- Modify: `prisma/schema.prisma` (Document·Tenant 관계 포함)
- Modify: `src/lib/tenant-deletion.ts`
- Test: `tenant-deletion.test.ts` (기존 파일에 추가)

**Interfaces:**
- Produces: `db.resolution` — `{ id, tenantId, meetingDocId, order, title, decision, followupStatus, dueDate, note, createdAt }`

- [ ] **Step 1: 스키마 추가** — DunningEntry 아래에:

```prisma
/// 의결사항 — 회의록 문서(불변 증빙)와 달리 완성 후에도 상태가 변한다(이행중→완료).
/// 완성본을 void해도 Resolution은 남긴다: 의결은 유효하고 문서만 폐기된 것이다.
/// (하드 삭제는 채번 전 초안뿐인데 그때는 Resolution이 아직 없다 — 완성 시 등록되므로.
///  Cascade는 그 불변식이 깨졌을 때의 안전벨트다. DunningEntry cascade 선례와 같음)
model Resolution {
  id             String    @id @default(cuid())
  tenantId       String
  tenant         Tenant    @relation(fields: [tenantId], references: [id])
  meetingDocId   String
  meetingDoc     Document  @relation(fields: [meetingDocId], references: [id], onDelete: Cascade)
  order          Int
  title          String
  decision       String // 가결 | 부결 | 보류
  followupStatus String // 없음(단순 의결) | 이행중 | 완료
  dueDate        DateTime?
  note           String?
  createdAt      DateTime  @default(now())

  @@index([tenantId, followupStatus])
  @@index([meetingDocId])
}
```

Tenant에 `resolutions Resolution[]`, Document에 `resolutions Resolution[]` 관계 추가.

- [ ] **Step 2: `npx prisma db push` → `npx prisma generate`** (dev 서버 재시작)

- [ ] **Step 3: purge에 추가** — `src/lib/tenant-deletion.ts` 트랜잭션의 dunningEntry 근처에:

```ts
db.resolution.deleteMany({ where: { tenantId } }),
```

- [ ] **Step 4: 테스트 확장** — `tenant-deletion.test.ts`: equipment와 같은 방식으로 resolution 1건 생성(meetingDoc용 문서 포함) → purge → count 0 단언.

- [ ] **Step 5: `npx tsx tenant-deletion.test.ts` 통과 확인**

---

### Task 2: 순수 함수 `src/lib/minutes.ts` + 테스트

**Files:**
- Create: `src/lib/minutes.ts`
- Test: `minutes.test.ts` (repo 루트, `npx tsx minutes.test.ts`)

**Interfaces (이후 모든 태스크가 소비):**

```ts
export const DECISIONS = ["가결", "부결", "보류"] as const;
export const FOLLOWUPS = ["없음", "이행중", "완료"] as const;
export const DEFAULT_NOTICE_DAYS = 5;

export type Attendee = {
  role: string; // "CHAIR" | "AUDITOR" | "ETC"
  label: string; // 표시 직함 — approverRoleLabel 결과 스냅샷
  name: string;
  present: boolean;
};
export type AgendaItem = {
  order: number;
  title: string;
  fromResolutionId?: string; // 전차 의결 이행 보고 안건이면 그 Resolution id
};
export type MinutesAgenda = {
  order: number;
  title: string;
  discussion: string[]; // 논의 요지 개조식
  decision: (typeof DECISIONS)[number] | "없음"; // "없음" = 의결 없는 보고 안건
  votesFor: number | null;
  votesAgainst: number | null;
};
export type MeetingMeta = {
  meetingNo: number; // 제N차
  meetingAt: string; // "YYYY-MM-DD HH:mm"
  place: string;
  noticeDays: number; // 소집 통지 기한(일) — 관리규약 값, 판정 안 함
  attendees: Attendee[]; // 명부 스냅샷 (증빙 원칙 — 명부를 고쳐도 지난 회의록 불변)
  agenda: AgendaItem[];
  minutes?: MinutesAgenda[]; // LLM 초안 + 사용자 수정본
  rawText?: string; // 붙여넣은 원 메모 (재생성 재료)
  noticeDocId?: string; // 파생 의결 공고문 역링크
};
```

- [ ] **Step 1: 실패하는 테스트 작성** — `minutes.test.ts`:

```ts
import assert from "node:assert/strict";
import {
  proposeAgenda, signTokenState, minutesHash, noticeDueYmd, signProgress,
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

console.log("minutes.test.ts OK");
```

- [ ] **Step 2: `npx tsx minutes.test.ts` 실패 확인** (모듈 없음)

- [ ] **Step 3: 구현** — `src/lib/minutes.ts` (클라이언트 번들 안전: DB import 금지. crypto는 서버 전용이라 `minutesHash`만 다르다 — 아래 참고):

```ts
import crypto from "node:crypto";

// (위 Interfaces 블록의 타입·상수 전부)

/** 미완료 의결 → 다음 회의 "이행 보고" 안건 자동 제안. 회의 준비 야근을 없애는 핵심 장치 */
export function proposeAgenda(
  unresolved: { id: string; title: string; meetingDocNo: string | null }[],
  existingCount: number,
): AgendaItem[] {
  return unresolved.map((r, i) => ({
    order: existingCount + i + 1,
    title: `전차 의결 이행 보고: ${r.title}${r.meetingDocNo ? ` (${r.meetingDocNo})` : ""}`,
    fromResolutionId: r.id,
  }));
}

/**
 * 서명 토큰 판정 — 결재(tokenState)와 두 가지가 다르다:
 * ① 병렬: 모든 스텝이 동시에 pending, 순서 없음. ② 완성(final) 문서에서만 서명한다
 * (결재는 pending 문서). 반려가 없다 — 서명하지 않으면 그냥 빈칸(자필란)으로 남는다.
 * fail-closed: 모르는 상태는 전부 invalid.
 */
export function signTokenState(
  step: { status: string; token: string | null; tokenExpiresAt: Date | null } | null,
  docStatus: string | undefined,
  now = new Date(),
): "valid" | "expired" | "done" | "invalid" {
  if (!step || !step.token) return "invalid";
  if (step.status === "approved") return "done";
  if (step.status !== "pending" || docStatus !== "final") return "invalid";
  if (!step.tokenExpiresAt || step.tokenExpiresAt <= now) return "expired";
  return "valid";
}

/**
 * 서명 시점 문서 버전 해시(증거력 장치 ①). 필드를 명시적으로 고른다 —
 * meta 전체를 넣으면 서명 뒤 공고문 파생(noticeDocId)이 해시를 깨뜨려
 * "서명 후 문서가 바뀌었다"는 거짓 신호가 된다.
 */
export function minutesHash(
  title: string,
  meta: Pick<MeetingMeta, "meetingNo" | "meetingAt" | "place" | "attendees" | "agenda"> &
    { minutes?: MinutesAgenda[] },
): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify([
      title, meta.meetingNo, meta.meetingAt, meta.place, meta.attendees, meta.agenda, meta.minutes ?? null,
    ]))
    .digest("hex");
}

/** 소집 통지 시한 — 회의일에서 noticeDays를 뺀 날짜(YYYY-MM-DD). 판정은 안 한다 */
export function noticeDueYmd(meetingAt: string, noticeDays: number): string {
  const d = new Date(`${meetingAt.slice(0, 10)}T00:00:00+09:00`);
  d.setUTCDate(d.getUTCDate() - noticeDays);
  return d.toISOString().slice(0, 10);
}

/** 전원 서명 판정 — 스텝 0개는 "요청 전"이지 완료가 아니다 */
export function signProgress(steps: { status: string }[]) {
  const signed = steps.filter((s) => s.status === "approved").length;
  return { signed, total: steps.length, allSigned: steps.length > 0 && signed === steps.length };
}
```

주의: `crypto` import 때문에 이 파일을 클라이언트 컴포넌트가 import하면 안 된다. 클라이언트가 타입·상수만 필요하면 `import type` 또는 상수만 개별 재수출로 해결(구현 중 실제 필요가 생길 때).

- [ ] **Step 4: `npx tsx minutes.test.ts` 통과 + `npx tsc --noEmit`**

---

### Task 3: 회의 만들기 + 소집 통지문 (Phase 2)

**Files:**
- Create: `src/app/(app)/modules/minutes/actions.ts`
- Create: `src/app/(app)/modules/minutes/new/page.tsx`, `new/meeting-form.tsx`
- Create: `src/app/(app)/modules/minutes/[docId]/page.tsx` (소집 단계 분기만 이번 태스크)
- Create: `src/components/convocation-paper.tsx`
- Modify: `src/lib/documents.ts` — 없음(`minutes: "회의"` 이미 등록됨, 확인만)

**Interfaces:**
- Consumes: Task 2의 `MeetingMeta`·`proposeAgenda`·`noticeDueYmd`, `createDocument`(numberOnSubmit: true), `ExternalApprover`·`approverRoleLabel`(rules.ts)
- Produces: `createMeeting(prev, formData): Promise<{ error?: string }>` (성공 시 redirect), 문서 meta = `MeetingMeta`

- [ ] **Step 1: actions.ts 뼈대** — repairs actions.ts 견본. 가드 두 개:

```ts
"use server";
const MODULE_ID = "minutes";
const TYPE = "minutes";

async function requireMinutes() {
  const session = await requireTenantSession();
  if (!(await isSubscribed(session.tenantId!, MODULE_ID))) redirect("/subscriptions");
  return session;
}
```

`createMeeting`: 폼에서 meetingAt(일시)·place·noticeDays(기본 5)·attendees(명부 체크 스냅샷)·agenda(자동 제안 수용분 + 자유 추가) 파싱. 검증: meetingAt 필수, 안건 1개 이상, 참석 대상 1명 이상. 회차는 `meetingNo = (그 단지 minutes 문서 수) + 1`이 아니라 **기존 문서 meta.meetingNo 최대값 + 1** (문서를 지우면 count가 줄어 회차가 겹친다 — 채번과 같은 이유). 저장:

```ts
const doc = await createDocument({
  tenantId, moduleId: MODULE_ID, type: TYPE,
  title: `제${meetingNo}차 입주자대표회의`,
  content: agenda.map((a) => a.title).join("\n"), // 문서함 검색용
  status: "draft", numberOnSubmit: true, // [회의록 완성]에서 채번 — 버린 소집이 결번을 남기면 안 된다
  dueDate: new Date(`${meetingAt.replace(" ", "T")}:00+09:00`), // 홈 할 일 위젯
  createdById: session.userId,
  meta: { meetingNo, meetingAt, place, noticeDays, attendees, agenda } satisfies MeetingMeta,
});
redirect(`/modules/minutes/${doc.id}`, RedirectType.replace);
```

- [ ] **Step 2: new 화면** — `new/page.tsx`(서버): 명부(`Tenant.externalApprovers` 전원, `approverRoleLabel`로 직함) + 미완료 Resolution(`followupStatus: "이행중"` + 그 회의 docNo) 조회 → `proposeAgenda` 결과를 초기 안건으로 `meeting-form.tsx`(클라이언트)에 전달. 폼: 일시(datetime-local)·장소·통지 기한(일, 기본 5, "관리규약을 확인하세요" 힌트)·참석 대상 전원 기본 체크·안건 목록(제안분은 삭제 가능, 자유 추가). 명부가 비어 있으면 안내: "설정 > 결재선에서 동대표 명부를 등록하면 참석 체크가 자동으로 채워집니다." 등록 없이도 진행은 가능(참석자 이름 직접 입력 행 추가).

- [ ] **Step 3: 소집 통지문** — `src/components/convocation-paper.tsx`. 게시판용이라 공고문 축(14pt). `notice-paper.tsx`의 PrintStyle·용지 틀을 견본으로:

제목 "제N차 입주자대표회의 소집 통지" / 일시·장소 표 / 안건 목록(번호 붙여) / Task 0 확정 문구 / 명의: externalApprovers의 CHAIR 이름("입주자대표회의 회장 ○○○"), 없으면 "관리사무소장". 날짜는 오늘(작성일).

- [ ] **Step 4: [docId] 소집 단계 화면** — 문서 조회(`tenantId` 필수 조건) 후 분기: `meta.minutes` 없으면 소집 단계 = 통지문 미리보기(ConvocationPaper) + [통지문 인쇄] + 통지 시한 표시(`noticeDueYmd`, 지났으면 빨간 안내 "통지 시한이 지났습니다. 관리규약을 확인하세요") + [회의 마침, 회의록 쓰기] 버튼(다음 태스크의 초안 화면으로 이동 — 이번 태스크에서는 버튼만 두고 링크 대상 화면은 Task 4).

- [ ] **Step 5: 검증** — `npx tsc --noEmit` + dev 서버에서 회의 생성 → 통지문 인쇄 미리보기 확인. **아직 홈(page.tsx)이 없으므로 /modules/minutes/new 직접 진입으로 확인.**

---

### Task 4: LLM 구조화 초안 (Phase 3 전반)

**Files:**
- Create: `src/lib/minutes-ai.ts`
- Create: `src/app/(app)/modules/minutes/[docId]/edit/page.tsx`, `edit/minutes-editor.tsx`
- Modify: `src/app/(app)/modules/minutes/actions.ts` — `generateMinutes`, `saveMinutesDraft`

**Interfaces:**
- Consumes: `MinutesAgenda`(Task 2), `aiEnabled`(gian/claude.ts), `rateLimit`(lib/rate-limit)
- Produces: `generateMinutesDraft(args: { agenda: { order: number; title: string }[]; rawText: string; meetingLabel: string }): Promise<{ agendas: MinutesAgenda[]; needsClarification: string[] }>`

- [ ] **Step 1: `src/lib/minutes-ai.ts`** — notice-ai.ts 동형(Sonnet 5, structured outputs, 고정부 캐싱). 핵심 차이는 **안건 앵커**: 자유 작문이 아니라 "주어진 안건 목록에 메모를 배분"하는 제약 과제다.

```ts
const DRAFT_SCHEMA = {
  type: "object" as const,
  properties: {
    agendas: {
      type: "array",
      description: "입력으로 준 안건 목록과 같은 순서·같은 개수. 안건을 더하거나 빼지 않는다",
      items: {
        type: "object",
        properties: {
          order: { type: "number" },
          title: { type: "string", description: "입력 안건명 그대로" },
          discussion: { type: "array", items: { type: "string" },
            description: "논의 요지 개조식. 메모에 없는 발언·수치·인명 금지. 관련 메모가 없으면 빈 배열" },
          decision: { type: "string", enum: ["가결", "부결", "보류", "없음"],
            description: "메모에 의결 결과가 없으면 '없음'" },
          votesFor: { type: ["number", "null"], description: "메모에 찬반 수가 있을 때만, 없으면 null" },
          votesAgainst: { type: ["number", "null"] },
        },
        required: ["order", "title", "discussion", "decision", "votesFor", "votesAgainst"],
        additionalProperties: false,
      },
    },
    needsClarification: { type: "array", items: { type: "string" },
      description: "메모가 없거나 모호해 확인이 필요한 안건·항목" },
  },
  required: ["agendas", "needsClarification"],
  additionalProperties: false,
};
```

SYSTEM 규칙(요지): 회의록 서기. 입력 메모의 내용만 쓴다. 메모에 없는 발언·수치·인명·업체명을 만들지 않는다. 존칭·구어는 개조식 문어로 다듬되 내용은 더하지 않는다. 안건 목록은 앵커다 — 순서·개수·제목을 바꾸지 않고, 각 안건에 해당하는 메모만 배분한다. 어느 안건에도 속하지 않는 메모는 가장 관련 있는 안건의 discussion 끝에 "(기타) " 접두로 넣는다. few-shot 1개(메모 → JSON) 포함, `cache_control: { type: "ephemeral" }`.

- [ ] **Step 2: `generateMinutes` 액션** — 가드 + `aiEnabled()` 검사(없으면 `{ error: "AI 초안 준비 중입니다. 아래에서 직접 입력할 수 있습니다." }`) + `rateLimit(\`minutes:${tenantId}\`, 30, 24*60*60*1000)` 일일 한도. 성공 시 `meta.minutes`·`meta.rawText` 저장(문서 status는 그대로 draft). **입구 검사**: 문서가 draft가 아니면 거부(완성 후 재생성 금지 — 불변 원칙).

- [ ] **Step 3: edit 화면** — `[docId]/edit`: 게이트 = `doc.status === "draft"`(완성 후엔 이 화면 자체가 404 redirect). 위: 메모 붙여넣기 textarea + [AI로 정리] (pending 중 스피너, aiEnabled 아니면 버튼 대신 "준비 중" 안내). 아래: 안건별 편집 카드(제목 고정 표시, 논의 요지 textarea 줄 단위, 의결 결과 select 가결/부결/보류/없음, 찬반 수 입력). [저장] = `saveMinutesDraft`(meta.minutes 갱신). LLM 없이도 전부 손으로 채울 수 있다 — 수용 기준 8.

- [ ] **Step 4: [docId] 분기 확장** — `meta.minutes` 있으면 초안 단계: 초안 요약 + [수정] + [회의록 완성](다음 태스크) 버튼 자리.

- [ ] **Step 5: 실 API 1건 수동 확인** — `minutes-draft.manual.ts`(repo 루트, `*-draft.manual.ts` 패턴): 안건 2개 + 가상 메모로 호출해 ① 안건 개수·순서 유지 ② 메모에 없는 수치·인명 없음 ③ 의결 없는 안건 decision "없음"을 눈으로 확인. `npx tsc --noEmit` 통과.

---

### Task 5: [회의록 완성] 채번 + Resolution 확인 UI + 회의록 A4 (Phase 3 후반)

**Files:**
- Modify: `src/app/(app)/modules/minutes/actions.ts` — `finalizeMinutes`, `voidMinutes`
- Create: `src/app/(app)/modules/minutes/[docId]/finalize-form.tsx`
- Create: `src/components/minutes-paper.tsx`

**Interfaces:**
- Consumes: `assignDocNo`, `DECISIONS`·`FOLLOWUPS`(Task 2)
- Produces: `finalizeMinutes(docId: string, resolutions: { order: number; title: string; decision: string; followupStatus: string; dueDate: string | null; note: string }[]): Promise<{ error?: string } | void>`

- [ ] **Step 1: 완성 확인 UI** — `finalize-form.tsx`: `meta.minutes`에서 decision이 "없음"이 아닌 안건을 **의결사항 후보로 프리필**(제목·가결/부결/보류). 각 행: 등록 체크(기본 켬)·후속 필요 여부(followupStatus "없음"/"이행중")·기한(선택)·비고. 안내 1줄: "확인된 의결만 등록됩니다. 회의록 완성 후 회의록은 수정할 수 없습니다." — **LLM 출력이 무확인으로 DB에 들어가지 않는다**(수용 기준 3).

- [ ] **Step 2: `finalizeMinutes`** — notice `finalizeNoticePost` + actOnStep 트랜잭션 패턴 합성:

```ts
export async function finalizeMinutes(docId, resolutions) {
  const session = await requireMinutes();
  const doc = await db.document.findFirst({ where: { id: docId, tenantId, type: TYPE } });
  if (!doc) return { error: "문서를 찾을 수 없습니다." };
  if (doc.status !== "draft") return { error: "이미 완성됐거나 폐기된 회의록입니다." };
  // 입력 검증: decision·followupStatus는 DECISIONS·FOLLOWUPS 안의 값만, title 필수
  await assignDocNo(doc); // 멱등 — 실패하면 초안으로 남아 다시 누르면 된다
  try {
    await db.$transaction(async (tx) => {
      // 완성 자리를 먼저 잡는다 — 동시 더블클릭이 Resolution을 두 벌 만들면 안 된다
      const claimed = await tx.document.updateMany({
        where: { id: doc.id, status: "draft" }, data: { status: "final" },
      });
      if (claimed.count === 0) throw new ActFailed("이미 완성 처리되었습니다.");
      if (resolutions.length > 0)
        await tx.resolution.createMany({
          data: resolutions.map((r) => ({ tenantId, meetingDocId: doc.id, ...r,
            dueDate: r.dueDate ? new Date(`${r.dueDate}T00:00:00+09:00`) : null })),
        });
    });
  } catch (e) { if (e instanceof ActFailed) return { error: e.message }; throw e; }
  revalidatePath(`/modules/minutes/${docId}`); revalidatePath("/modules/minutes");
}
```

- [ ] **Step 3: `voidMinutes`** — notice 폐기 규칙 동형: docNo 없는 초안은 하드 삭제(Resolution은 아직 없음, ApprovalStep·첨부는 Cascade), 완성본은 `status: { not: "void" }` 조건부 updateMany로 void. **Resolution은 지우지 않는다 — 의결은 유효, 문서만 폐기**(주석으로 명기, 수용 기준 9).

- [ ] **Step 4: 회의록 A4** — `src/components/minutes-paper.tsx`. 기안 축(11.5pt), `gian-paper.tsx` 괘선 문법(`--gian-doc-line`):

제목 "제N차 입주자대표회의 회의록" / 정보 표: 문서번호·회차·일시·장소·참석(재적 N명 중 N명) / 안건별: 제목 → 논의 요지(개조식 ㆍ목록) → 의결 결과 줄("가결 (찬성 5, 반대 1)" — 찬반 null이면 결과만) / 하단 서명 표: 참석자 행마다 직함·성명·서명란. **전자서명 완료 행은 서명란에 "전자서명 YYYY-MM-DD HH:mm" 인쇄, 미서명 행은 빈칸(=자필란)** — Task 6 전이라 지금은 전부 빈칸으로 나온다(자필 경로, 수용 기준 5). 행마다 `break-inside-avoid`.

- [ ] **Step 5: [docId] 완성 단계 분기** — status "final": MinutesPaper + [인쇄] + [서명 요청](Task 6 자리) + [의결 공고문 만들기](Task 7 자리) + 의결사항 목록 카드. 헤드리스 실측: dev 서버에서 인쇄 미리보기로 1페이지 수용·표 쪼개짐 확인(공지문 printToPDF 검증법).

- [ ] **Step 6: `npx tsc --noEmit` + 완성 흐름 수동 확인** — 초안 → 완성 → `회의-2026-0001` 채번·Resolution 등록·A4 확인.

---

### Task 6: 전자서명 (Phase 4)

**Files:**
- Modify: `src/app/(app)/modules/minutes/actions.ts` — `requestSignatures`, `reissueSignToken`
- Create: `src/app/sign/[token]/page.tsx`, `sign/[token]/actions.ts`, `sign/[token]/sign-form.tsx`
- Modify: `src/app/(app)/modules/minutes/[docId]/page.tsx` — 서명 현황 카드
- Modify: `src/components/minutes-paper.tsx` — 서명 기록 반영
- Test: `minutes.test.ts` — 이미 Task 2에서 `signTokenState` 커버(추가 없음)

**설계 기록(스펙 §3 요구):** 서명 저장은 **ApprovalStep 재사용**. 근거 — 토큰 발급·만료·1회용·`@unique(token)`·이름 스냅샷·`signature Json` 증적·Cascade가 전부 이미 있고, 결재와 다른 점(순차 vs 병렬)은 **행 생성 방식**(전원 동시 pending+토큰)과 **판정 함수**(`signTokenState` — final 문서)에만 있다. `actOnStep`·`tokenState`는 쓰지 않는다(순차·pending 문서 전제).

- [ ] **Step 1: `requestSignatures(docId)`** — 게이트: status "final" + 참석자(present) 1명 이상. **한 번만**: 이미 스텝이 있으면 거부(재발급은 스텝 단위 `reissueToken` 재사용). 참석자마다 스텝 생성 — 병렬이므로 전원 pending + 각자 토큰:

```ts
await db.approvalStep.createMany({
  data: present.map((a, i) => ({
    documentId: doc.id, order: i + 1, name: a.name,
    externalRole: a.role === "ETC" ? null : a.role, // 표시용 — 판정에 안 쓴다
    status: "pending", token: newToken(), tokenExpiresAt: tokenExpiry(),
  })),
});
```

`newToken`·`tokenExpiry`는 gian/approval.ts에서 export가 안 돼 있으면 export를 추가한다(동작 변경 없음). 스텝 생성 전에 이미 스텝이 있는지 검사가 아니라 **`createMany` 전에 `count`로 확인 후, 경합은 `@@unique([documentId, order])` 충돌로 잡는다**(P2002면 "이미 요청됨" 문구).

- [ ] **Step 2: 서명 현황 카드** — [docId] 완성 분기에: 스텝별 이름·상태·[링크 복사](SMTP 없으면 기본 전달 수단 — 카톡)·만료 시 [재발급]. `signProgress`로 "서명 3/5" 표시, allSigned면 "전원 서명 완료" 배지. 메일 발송은 `mailerEnabled()`일 때만 externalApprovers에서 이메일을 찾아 `trySend`(연락처는 현재 설정에서 — 결재와 같은 판단). Task 0 확정 문구(관리규약 확인 1줄)를 카드에 표시.

- [ ] **Step 3: 공개 서명 화면** — `/sign/[token]`: `approve/[token]/page.tsx` 견본. 토큰으로 스텝+문서 조회 → `signTokenState(step, doc.status)` 분기(valid 외엔 사유 화면 — fail-closed). valid면 회의록 전문(MinutesPaper 읽기 전용) + 이름 입력 + [서명] 버튼.

- [ ] **Step 4: 서명 액션** — `sign/[token]/actions.ts`:

```ts
export async function signMinutes(token: string, typedName: string) {
  const step = await db.approvalStep.findUnique({ where: { token }, include: { document: true } });
  if (signTokenState(step, step?.document.status) !== "valid")
    return { error: "서명할 수 없는 링크입니다." };
  const doc = step!.document;
  const meta = doc.meta as MeetingMeta;
  const updated = await db.approvalStep.updateMany({
    where: { id: step!.id, status: "pending" }, // 이중 제출 차단 — 조건부 updateMany
    data: {
      status: "approved", actedAt: new Date(),
      signature: { ip, ua, typedName: typedName.trim(),
        docHash: minutesHash(doc.title, meta) }, // 증거력 ①: 서명 시점 문서 해시
    },
  });
  if (updated.count === 0) return { error: "이미 서명이 처리되었습니다." };
}
```

ip·ua는 approve/[token]/actions.ts와 같은 방식(headers)으로 얻는다. **회의록 완성(final) 후 meta는 noticeDocId 외에 변하지 않으므로**(edit는 draft만, 입구 검사) 모든 서명의 docHash가 같아야 정상이다 — 증거력 ②(수정 잠금)는 이 구조가 보장한다.

- [ ] **Step 5: A4 서명 기록 인쇄** — MinutesPaper에 steps prop 추가: approved 스텝은 해당 참석자 행 서명란에 "전자서명 YYYY-MM-DD HH:mm", 그 외 빈칸. 하단에 작은 글씨 서명 기록 표(성명·일시·방식 "전자(링크)") — approved가 1건 이상일 때만 표시(전부 자필이면 표가 무의미).

- [ ] **Step 6: 검증** — 토큰 흐름 수동 확인: 요청 → 링크 열기 → 서명 → 현황·A4 반영, 같은 링크 재클릭 시 "이미 서명" 확인. `npx tsc --noEmit`.

---

### Task 7: 의결사항 대장 + 모듈 홈 (Phase 5)

**Files:**
- Create: `src/app/(app)/modules/minutes/page.tsx`
- Create: `src/app/(app)/modules/minutes/resolutions/page.tsx`, `resolutions/status-select.tsx`
- Modify: `src/app/(app)/modules/minutes/actions.ts` — `setResolutionStatus`

**Interfaces:**
- Consumes: Task 1 `db.resolution`, Task 2 `signProgress`·`noticeDueYmd`
- Produces: `setResolutionStatus(id: string, status: "없음" | "이행중" | "완료"): Promise<{ error?: string } | void>`

- [ ] **Step 1: `setResolutionStatus`** — 가드 + `updateMany({ where: { id, tenantId }, ... })` (tenantId 필수 — 남의 단지 의결을 못 바꾼다). FOLLOWUPS 밖 값 거부.

- [ ] **Step 2: 의결사항 대장** — `/modules/minutes/resolutions`: 전 회의 통합 테이블(의결일=회의일·회의 문서번호 링크·제목·결과·후속 상태·기한). 필터: 상태(전체/이행중/완료)·검색(제목 contains). 기한 경과+이행중은 빨간 표시. 상태 변경은 행 안 select 한 클릭(`status-select.tsx`). **이 화면이 곧 소장의 방어 기록** — 화면 설명에 그대로 적는다: "언제 어느 회의에서 무엇이 의결됐는지 문서번호로 찾습니다."

- [ ] **Step 3: 모듈 홈** — repairs 홈 구성 견본:
  - 다음 회의 카드: `dueDate >= 오늘`인 가장 가까운 minutes 문서 — D-day·통지 시한(`noticeDueYmd`, 지났고 아직 소집 단계면 빨간 경고). **크론 없이 열 때 계산**(repairs 반복 고장과 같은 판단 — 인앱 Notification 발송은 외부 스케줄러 등록 후 별건으로 미룬다. 스펙의 "D-day 인앱 알림"에서 의도적으로 줄인 부분이니 사용자에게 보고할 것).
  - 미이행 의결 카드(AttentionCard): 기한 경과 이행중 N건 → 대장 링크.
  - 회의록 목록: 최근 문서 테이블(회차·문서번호·일시·상태(소집 중/초안/완성/폐기)·서명 N/M).
  - [새 회의] 버튼 → /new.

- [ ] **Step 4: 사이클 확인** — 회의 A 완성(이행중 의결 1건) → 새 회의 B 만들기 화면에 "전차 의결 이행 보고" 안건이 자동 제안되는지 확인(수용 기준 1). `npx tsc --noEmit`.

---

### Task 8: 의결 공고문 파생 + 출시 (Phase 6)

**Files:**
- Modify: `src/app/(app)/modules/minutes/actions.ts` — `createResolutionNotice`
- Modify: `src/app/(app)/modules/minutes/[docId]/page.tsx` — 파생 버튼·역링크
- Modify: `prisma/seed.ts` — 레지스트리 재정의 + 데모 데이터
- Modify: `src/lib/guide.ts` — 사용법 섹션 (같은 커밋 — 스펙 Phase 6 명시)
- Modify: `src/app/(app)/documents/page.tsx` — LINKABLE_MODULES에 "minutes"
- Modify: 모듈 홈 PageHeader에 `<GuideLink section="minutes" />`

**Interfaces:**
- Consumes: `createDocument`(sourceDocId), `findNoticeFor`(gian/notice.ts), `NoticeDoc`·`notice-paper.tsx`

- [ ] **Step 1: `createResolutionNotice(docId)`** — gian Phase 3 동형·결정적 코드:

게이트: status "final" + 의결 1건 이상. `findNoticeFor(doc.id)` 있으면 그 문서로 안내. `NoticeDoc` 조립(작문 없음): 제목 "제N차 입주자대표회의 의결사항 공고" / intro "제N차 입주자대표회의(YYYY년 M월 D일)에서 다음과 같이 의결되었음을 공고합니다." / rows = 의결사항(k: "제N호 안건", v: "제목 — 가결(찬성 5, 반대 1)") / notes = ["회의록은 관리사무소에 보관되어 있습니다."]. `createDocument({ type: "notice", status: "final", sourceDocId: doc.id, meta: { sourceDocId, notice } })` — `@@unique([type, sourceDocId])`가 동시 파생을 막고, P2002는 "이미 만들어짐"으로 처리(createNoticeFrom과 동일). 성공 시 `meta.noticeDocId` 역링크 저장. **파생 실패가 완성을 롤백하지 않는다** — 완성은 이미 끝난 일이고 파생은 언제든 다시 누른다(수용 기준 6).

- [ ] **Step 2: 시드 재정의** — 모듈명·설명은 **AskUserQuestion으로 사용자 확인** 후(가칭 "입대의 회의록·의결 관리" / 설명은 실제 동작 그대로: 소집→기록→서명→공고→추적). `isActive: true` 전환. 아이콘 ClipboardList·가격 20,000원·id "minutes" 유지. 데모 시드: 완성 회의 1건(의결 3건 — 완료 1·이행중 1·기한 경과 1) + 소집 단계 회의 1건 — 홈·대장·자동 제안이 데모에서 다 보이게.

- [ ] **Step 3: guide.ts 사용법 섹션** — MODULE_GUIDES에 minutes 추가(flow: 회의 만들기 → 소집 통지 → 회의록 정리 → 완성·서명 → 공고·이행 추적). 모듈 홈에 GuideLink. documents/page.tsx LINKABLE_MODULES에 "minutes".

- [ ] **Step 4: 수용 기준 전체 점검** — 스펙 §9의 11개 항목을 하나씩 수동 확인하고 결과를 사용자에게 표로 보고. 특히: ANTHROPIC_API_KEY 없는 상태에서 소집·완성·서명·공고가 전부 도는지(8), 서명 후 edit 진입이 draft 게이트에 막히는지(4), 같은 파일 재요청 시 서명 요청이 중복 생성되지 않는지.

- [ ] **Step 5: `npx tsx minutes.test.ts && npx tsx tenant-deletion.test.ts && npx tsc --noEmit`** — 전부 통과 후 사용자에게 커밋 분할 제안(스키마+순수함수 / 소집·회의록·서명 / 대장·공고·출시 3개 권장) 및 지시 대기.

---

## Self-Review 기록

- 스펙 §9 수용 기준 ↔ 태스크: 1→T7, 2→T4, 3→T5, 4→T6, 5→T5·T6, 6→T8, 7→T7, 8→T4·T8, 9→T1·T5, 10→T2, 11→T8. 누락 없음.
- 스펙과 다르게 간 것(사용자 보고 사항): ① D-day **인앱 알림 발송**은 화면 계산 경고로 대체(크론 미등록 상태 — training·inspection과 같은 처지. 스케줄러 등록 시 별건). ② 명부 동·호 JSON 확장은 뺐다(참석 체크에 직함·이름이면 충분 — YAGNI, 필요 시 label에 "101동 대표"로 적힌다).
- 타입 일관성: `MinutesAgenda.decision`의 "없음"은 화면·LLM 전용이고 Resolution.decision에는 DECISIONS(가결/부결/보류)만 들어간다 — finalize 확인 UI가 "없음" 안건을 후보에서 빼는 것으로 일치.
