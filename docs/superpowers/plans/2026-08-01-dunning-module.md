# 미납 독촉장 자동완성 모듈 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 미납 세대 데이터(엑셀/직접 입력)만 넣으면 1차 납부 안내 → 2차 최고 → 3차 내용증명을 자동 완성하고 세대별 A4를 일괄 인쇄하는 `dunning` 모듈. 발송 이력으로 다음 단계를 자동 제안한다.

**Architecture:** 발송 회차 1개 = `Document`(type `dunning_letter`, 생성 즉시 final·채번), 세대 행 = 새 모델 `DunningEntry`. 문안은 결정적 템플릿 함수(LLM 없음). 스펙: `docs/superpowers/specs/2026-08-01-dunning-module-design.md`.

**Tech Stack:** Next.js 16 App Router, Prisma 7 + PostgreSQL, xlsx(SheetJS, 설치됨), 기존 인쇄 체계(PrintStyle/PaperScale), tsx assert 테스트.

## Global Constraints

- **돈·상태를 바꾸는 함수는 자기 입구에서 검사한다** — `createDunningBatch`가 스스로 `isSubscribed` 확인 (AGENTS.md).
- **트랜잭션 안 행별 쿼리 루프 금지** — 세대 행은 `createMany` 한 방 (AGENTS.md).
- **동작을 바꾸면 문구·주석도 같은 커밋에서** (AGENTS.md).
- **운영자 개입 없는 셀프서비스** — "문의하세요" 출구 금지 (AGENTS.md).
- **⚠️ 사용자 dev 서버가 떠 있는 동안 `next build` 금지** (메모리 규칙). `prisma generate`/`migrate dev`가 Windows에서 EPERM(쿼리 엔진 DLL 잠김)이 나면 사용자에게 dev 서버 중지를 요청할 것.
- **종이 활자 크기는 읽는 거리로** — 독촉장은 우편물(책상 30cm)이라 기안서급 11.5pt 계열. 공고문 14pt 아님 (메모리 규칙).
- **A4 넘침은 실측** — 산술 추정 금지 (메모리 규칙).
- 커밋 메시지는 한국어, PowerShell 함정 회피를 위해 Bash 툴에서 `git commit -F <파일>` 사용.
- 테스트는 리포 루트 `*.test.ts`, `npx tsx <파일>` 실행, `node:assert` 기반, 프레임워크 없음.
- 모든 신규 화면은 `isSubscribed(tenantId, "dunning")` 가드. 쓰기 액션은 `requireRole(Role.DIRECTOR, Role.ACCOUNTANT)` — 부과·수납 실무자 기준(세대 명부 업로드와 동일).

---

### Task 1: DunningEntry 스키마 + 마이그레이션

**Files:**
- Modify: `prisma/schema.prisma` (Unit 모델 아래, Tenant·Document의 relation 목록)

**Interfaces:**
- Produces: Prisma 모델 `DunningEntry` — 이후 모든 태스크가 `db.dunningEntry`로 사용.

- [ ] **Step 1: 모델 추가**

`prisma/schema.prisma`의 `model Unit` 블록 아래에 추가:

```prisma
// ── 미납 독촉 발송 이력 ──────────────────────────────────────
// 발송 1건 = 세대 1행. 회차 문서(Document)는 불변 스냅숏이고,
// 납부 확인(paidAt)처럼 나중에 바뀌는 상태는 여기에만 찍는다.
model DunningEntry {
  id        String    @id @default(cuid())
  tenantId  String
  tenant    Tenant    @relation(fields: [tenantId], references: [id])
  docId     String // 소속 발송 회차 (type: dunning_letter)
  document  Document  @relation(fields: [docId], references: [id])
  dong      String // "101"
  ho        String // "502"
  name      String? // 엑셀에 없으면 세대명부(Unit)에서 채움
  amount    Int // 미납액(원)
  /// 미납 기간 자유 텍스트 ("2026년 3월분 ~ 6월분") — 회계 프로그램마다
  /// export 형식이 제각각이라 구조화(시작월·종료월)는 파싱 실패만 만든다
  period    String?
  stage     Int // 1 납부 안내 · 2 납부 최고 · 3 내용증명
  paidAt    DateTime? // 납부 확인 시각 — 다음 회차 단계 제안이 이 값을 본다
  createdAt DateTime  @default(now())

  @@index([tenantId, dong, ho])
}
```

`model Tenant` relation 목록(`billing Billing?` 근처)에 `dunningEntries DunningEntry[]`, `model Document` relation 목록에 `dunningEntries DunningEntry[]` 추가.

- [ ] **Step 2: 마이그레이션**

Run: `npx prisma migrate dev --name dunning_entry`
Expected: 새 마이그레이션 폴더 생성, client 재생성. EPERM이면 사용자에게 dev 서버 중지 요청 후 재시도.

- [ ] **Step 3: tsc 확인**

Run: `npx tsc --noEmit`
Expected: 통과 (오류 0).

- [ ] **Step 4: Commit**

```bash
git add prisma/
git commit -F <메시지파일>   # "독촉 발송 이력 테이블 — 문서는 불변, 납부 상태는 엔트리에"
```

---

### Task 2: 문안·단계·파싱 순수 로직 (`src/lib/dunning.ts`) + 테스트

**Files:**
- Create: `src/lib/dunning.ts`
- Test: `dunning.test.ts` (리포 루트)

**Interfaces:**
- Produces (이후 태스크가 그대로 사용):
  - `type DunningStage = 1 | 2 | 3`
  - `type DunningRow = { dong: string; ho: string; name: string | null; amount: number; period: string | null }`
  - `type DunningLetter = { stage; kind; title; recipient; paragraphs: string[]; table: { k; v }[]; notes: string[]; proof?: { sender; senderAddr; receiver; receiverAddr } }`
  - `stageLabels: Record<DunningStage, string>` — `{1: "납부 안내", 2: "납부 최고", 3: "내용증명"}`
  - `suggestStage(prev?: { stage: number; paidAt: Date | null } | null): DunningStage`
  - `parseDunningRows(rows: unknown[][]): { rows: DunningRow[]; error?: string }`
  - `buildLetter(args): DunningLetter`
  - `won(n: number): string`, `koDate(ymd: string): string`

- [ ] **Step 1: 실패하는 테스트 작성** (`dunning.test.ts`)

```ts
/**
 * 독촉 문안·단계·엑셀 해석 검증 (DB 불필요) — npx tsx dunning.test.ts
 */
import assert from "node:assert";
import {
  buildLetter,
  koDate,
  parseDunningRows,
  suggestStage,
  won,
} from "./src/lib/dunning";

// 단계 제안: 이력 없음/납부됨 → 1단계, 미납 이력 → 다음 단계, 3이 끝
assert.equal(suggestStage(), 1);
assert.equal(suggestStage(null), 1);
assert.equal(suggestStage({ stage: 2, paidAt: new Date() }), 1);
assert.equal(suggestStage({ stage: 1, paidAt: null }), 2);
assert.equal(suggestStage({ stage: 3, paidAt: null }), 3);

// 금액·날짜 표기
assert.equal(won(456000), "456,000원");
assert.equal(koDate("2026-08-15"), "2026년 8월 15일");

// 엑셀 해석: 머리글 건너뜀, 동·호 접미사 제거, "456,000원" 숫자화, 금액 없는 행 제외
const parsed = parseDunningRows([
  ["동", "호", "미납액", "이름", "미납 기간"],
  ["101동", "502호", "456,000원", "홍길동", "2026년 3월분 ~ 6월분"],
  ["103", "1201", "152000", "", ""],
  ["104", "301", "", "", ""], // 금액 없음 — 대상 아님
]);
assert.equal(parsed.error, undefined);
assert.equal(parsed.rows.length, 2);
assert.deepEqual(parsed.rows[0], {
  dong: "101", ho: "502", amount: 456000,
  name: "홍길동", period: "2026년 3월분 ~ 6월분",
});
assert.equal(parsed.rows[1].name, null);
assert.ok(parseDunningRows([]).error);

// 문안: 1단계는 안내, 3단계만 내용증명 발신·수신 블록
const base = {
  row: parsed.rows[0], dueDate: "2026-08-15",
  account: "우리은행 1002-345-678901 (행복아파트관리사무소)",
  office: "행복아파트 관리사무소", address: "서울시 행복구 행복로 123",
};
const first = buildLetter({ ...base, stage: 1 });
assert.equal(first.kind, "관리비 납부 안내문");
assert.equal(first.recipient, "101동 502호 홍길동 님");
assert.equal(first.proof, undefined);
assert.ok(first.table.some((r) => r.k === "미납 금액" && r.v === "456,000원"));
assert.ok(first.table.some((r) => r.k === "납부 기한" && r.v === "2026년 8월 15일"));
assert.ok(first.table.some((r) => r.k === "미납 기간"));

// 기간 없는 세대는 기간 행 자체가 빠진다 — 빈 칸을 인쇄하지 않는다
const noPeriod = buildLetter({ ...base, row: parsed.rows[1], stage: 1 });
assert.ok(!noPeriod.table.some((r) => r.k === "미납 기간"));
assert.equal(noPeriod.recipient, "103동 1201호 입주자 님");

const second = buildLetter({ ...base, stage: 2 });
assert.equal(second.kind, "관리비 납부 최고서");
assert.ok(second.paragraphs.some((p) => p.includes("최고")));

const third = buildLetter({ ...base, stage: 3 });
assert.equal(third.kind, "내용증명");
assert.ok(third.proof);
assert.equal(third.proof!.sender, "행복아파트 관리사무소");
assert.equal(third.proof!.receiver, "홍길동 (101동 502호)");
assert.equal(third.proof!.receiverAddr, "서울시 행복구 행복로 123 101동 502호");
assert.ok(third.paragraphs.some((p) => p.includes("지급명령")));

console.log("dunning.test.ts 통과");
```

- [ ] **Step 2: 실패 확인**

Run: `npx tsx dunning.test.ts`
Expected: FAIL — `Cannot find module './src/lib/dunning'`

- [ ] **Step 3: 구현** (`src/lib/dunning.ts`)

```ts
/**
 * 미납 독촉 3단계 — 단계 판정·엑셀 행 해석·문안 빌더 (DB 없음, 결정적).
 * 공고문(buildNotice)과 같은 원칙: LLM을 부르지 않는다. 독촉장·내용증명은
 * 법적 표현이 정형화돼 있고, 문구가 매번 같아야 관리소장이 안심한다.
 */

export type DunningStage = 1 | 2 | 3;

export const stageLabels: Record<DunningStage, string> = {
  1: "납부 안내",
  2: "납부 최고",
  3: "내용증명",
};

export type DunningRow = {
  dong: string;
  ho: string;
  name: string | null;
  amount: number; // 원
  period: string | null; // "2026년 3월분 ~ 6월분" 자유 텍스트
};

/** 지난 발송이 남아 있고 아직 미납이면 다음 단계, 아니면 1단계부터. 3이 끝. */
export function suggestStage(
  prev?: { stage: number; paidAt: Date | null } | null,
): DunningStage {
  if (!prev || prev.paidAt) return 1;
  return Math.min(prev.stage + 1, 3) as DunningStage;
}

/**
 * 엑셀 행 해석. A=동, B=호, C=미납액(필수), D=이름(선택), E=미납 기간(선택).
 * 금액이 없는 행은 합계·명부 줄이므로 조용히 건너뛴다.
 */
export function parseDunningRows(rows: unknown[][]): {
  rows: DunningRow[];
  error?: string;
} {
  const cell = (r: unknown[], i: number) => String(r[i] ?? "").trim();
  // 세대 명부 업로드와 같은 규칙 — "동"으로 끝나는 머리글은 버리고 "101동"은 살린다
  const isHeader = (v: string) => v === "동" || /^동\s*\S*$/.test(v);
  const out: DunningRow[] = [];
  for (const r of rows) {
    if (!Array.isArray(r) || !cell(r, 0) || !cell(r, 1)) continue;
    if (isHeader(cell(r, 0))) continue;
    const amount = Number(cell(r, 2).replace(/[^\d]/g, ""));
    if (!amount) continue;
    out.push({
      dong: cell(r, 0).replace(/동$/, ""),
      ho: cell(r, 1).replace(/호$/, ""),
      amount,
      name: cell(r, 3) || null,
      period: cell(r, 4) || null,
    });
  }
  if (out.length === 0)
    return {
      rows: [],
      error:
        "읽을 세대가 없습니다. A열=동, B열=호, C열=미납액 형식인지 확인해 주세요.",
    };
  return { rows: out };
}

export const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

/** "2026-08-15" → "2026년 8월 15일" */
export function koDate(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return `${y}년 ${m}월 ${d}일`;
}

export type DunningLetter = {
  stage: DunningStage;
  /** 상단 중앙 문서 이름 */
  kind: string;
  /** 본문 첫머리 제목 */
  title: string;
  recipient: string; // "101동 502호 홍길동 님"
  paragraphs: string[];
  table: { k: string; v: string }[];
  notes: string[];
  /** 3단계(내용증명)만 — 우체국 요건인 발신·수신 기재 */
  proof?: {
    sender: string;
    senderAddr: string;
    receiver: string;
    receiverAddr: string;
  };
};

export function buildLetter({
  row,
  stage,
  dueDate,
  account,
  office,
  address,
}: {
  row: DunningRow;
  stage: DunningStage;
  dueDate: string; // "2026-08-15"
  account: string;
  office: string; // "행복아파트 관리사무소"
  address: string | null; // 3단계 내용증명의 발신·수신 주소에 쓴다
}): DunningLetter {
  const unit = `${row.dong}동 ${row.ho}호`;
  const who = row.name ?? "입주자";
  const due = koDate(dueDate);
  const table = [
    { k: "대상 세대", v: unit },
    ...(row.period ? [{ k: "미납 기간", v: row.period }] : []),
    { k: "미납 금액", v: won(row.amount) },
    { k: "납부 기한", v: due },
    { k: "납부 계좌", v: account },
  ];
  const corrected =
    "이미 납부하셨거나 내역이 다르면 관리사무소로 알려주시기 바랍니다. 확인 후 바로 정정하겠습니다.";

  if (stage === 1)
    return {
      stage,
      kind: "관리비 납부 안내문",
      title: "관리비 납부 안내",
      recipient: `${unit} ${who} 님`,
      paragraphs: [
        `안녕하십니까. ${office}입니다.`,
        "귀 세대의 관리비가 아래와 같이 미납되어 있어 안내드립니다. 사정이 있으시겠지만 기한 내에 납부하여 주시기 바랍니다.",
      ],
      table,
      notes: [
        corrected,
        "기한 내 납부가 어려우신 경우 관리사무소와 분할 납부를 협의하실 수 있습니다.",
      ],
    };

  if (stage === 2)
    return {
      stage,
      kind: "관리비 납부 최고서",
      title: "미납 관리비 납부 최고",
      recipient: `${unit} ${who} 님`,
      paragraphs: [
        `${office}입니다. 귀 세대의 미납 관리비에 대하여 납부 안내를 드렸으나 현재까지 납부가 확인되지 않아, 관리규약에 따라 아래와 같이 납부를 최고합니다.`,
        "납부 기한까지 납부되지 아니할 경우 관리규약이 정하는 바에 따라 연체료가 부과되며, 이후 절차가 진행될 수 있음을 알려드립니다.",
      ],
      table,
      notes: [corrected],
    };

  return {
    stage,
    kind: "내용증명",
    title: "미납 관리비 납부 최고",
    recipient: `${unit} ${who} 님`,
    paragraphs: [
      "발신인은 수신인에 대하여 아래와 같이 미납 관리비의 납부를 최고합니다.",
      `수신인은 ${row.period ? `${row.period} ` : ""}관리비 합계 ${won(row.amount)}을 현재까지 납부하지 아니하였습니다. 발신인은 수차례 납부를 안내하였으나 이행되지 않았습니다.`,
      `${due}까지 위 금액을 아래 계좌로 납부하여 주시기 바랍니다.`,
      "위 기한까지 납부되지 아니할 경우 발신인은 지급명령 신청 등 법적 절차를 진행할 예정이며, 이로 인하여 발생하는 비용은 수신인에게 청구될 수 있음을 알려드립니다.",
    ],
    table,
    notes: [corrected],
    proof: {
      sender: office,
      senderAddr: address ?? "",
      receiver: `${who} (${unit})`,
      receiverAddr: [address, unit].filter(Boolean).join(" "),
    },
  };
}
```

발송일(`sentDate`)은 이 함수가 받지 않는다 — 용지(`DunningSheets`)가 직접 받아 그린다.

- [ ] **Step 4: 통과 확인**

Run: `npx tsx dunning.test.ts`
Expected: `dunning.test.ts 통과`

- [ ] **Step 5: Commit**

```bash
git add src/lib/dunning.ts dunning.test.ts
git commit -F <메시지파일>   # "독촉 문안은 결정적 함수다 — 3단계 템플릿·단계 판정·엑셀 해석"
```

---

### Task 3: A4 용지 렌더러 (`src/components/dunning-paper.tsx`)

**Files:**
- Create: `src/components/dunning-paper.tsx`

**Interfaces:**
- Consumes: `DunningLetter`, `stageLabels` (Task 2)
- Produces: `DunningSheets({ letters, docNo, sentDate, office, tel, sealImage, logoImage })` — id `"dunning-sheets"` 컨테이너에 세대당 1장, `break-after-page`. 서버·클라이언트 양쪽에서 import 가능(지시어 없는 순수 렌더).

- [ ] **Step 1: 구현**

`notice-paper.tsx`의 명의·직인 마크업을 따르되, **우편물이므로 기안서급 활자(본문 11.5pt)**. 인쇄 여백은 PrintStyle `margin="18mm 20mm"`이 담당하므로 시트는 `print:p-0`.

```tsx
import type { DunningLetter } from "@/lib/dunning";

/**
 * 독촉장 A4 렌더러 — 세대당 1장, 회차 전체를 break-after-page로 일괄 인쇄.
 * 활자가 공고문(14pt)보다 작은 이유: 공고문은 1m 밖에서 서서 읽는 게시물이고
 * 이건 손에 들고 30cm에서 읽는 우편물이다. 기안서와 같은 11.5pt 기준.
 */
export function DunningSheets({
  letters,
  docNo,
  sentDate,
  office,
  tel,
  sealImage,
  logoImage,
}: {
  letters: DunningLetter[];
  docNo: string;
  sentDate: string; // "2026년 8월 1일"
  office: string;
  tel?: string | null;
  sealImage?: string | null;
  logoImage?: string | null;
}) {
  return (
    <div id="dunning-sheets" className="space-y-6 print:space-y-0">
      {letters.map((letter, i) => (
        <div
          key={i}
          className="flex w-full max-w-[210mm] shrink-0 break-after-page flex-col border bg-white px-[20mm] py-[18mm] text-[11.5pt] leading-[1.8] text-[#111] shadow-sm lg:min-h-[297mm] lg:w-[210mm] print:min-h-0 print:border-0 print:p-0 print:shadow-none"
        >
          {/* 문서번호·발송일 — 우편물이라 게시표(3분할 헤더)가 아니라 소자 한 줄 */}
          <div className="flex justify-between text-[9pt] text-[#555]">
            <span>문서번호: {docNo}</span>
            <span>발송일: {sentDate}</span>
          </div>

          <h1 className="mt-[8mm] mb-[10mm] text-center text-[20pt] font-extrabold tracking-[.4em] indent-[.4em]">
            {letter.kind}
          </h1>

          {/* 내용증명(3단계)만 — 우체국 요건인 발신·수신 기재 */}
          {letter.proof && (
            <table className="mb-[8mm] w-full border-collapse text-[10.5pt]">
              <tbody>
                {(
                  [
                    ["발신인", letter.proof.sender, letter.proof.senderAddr],
                    ["수신인", letter.proof.receiver, letter.proof.receiverAddr],
                  ] as const
                ).map(([role, name, addr]) => (
                  <tr key={role}>
                    <th className="w-[18mm] border border-[#333] bg-[#F3F4F6] px-[2mm] py-[1.6mm] text-center font-bold">
                      {role}
                    </th>
                    <td className="border border-[#333] px-[3mm] py-[1.6mm]">
                      {name}
                      {addr && (
                        <span className="block text-[9.5pt] text-[#444]">
                          {addr}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <p className="mb-[5mm] font-bold">받는 분: {letter.recipient}</p>
          {letter.paragraphs.map((p, j) => (
            <p key={j} className="mb-[3.5mm] indent-[2ch]">
              {p}
            </p>
          ))}

          <table className="my-[5mm] w-full border-collapse text-[11pt]">
            <tbody>
              {letter.table.map((r) => (
                <tr key={r.k}>
                  <th className="w-[32mm] border border-[#333] bg-[#F3F4F6] px-[3mm] py-[2mm] text-center font-bold tracking-[.2em] whitespace-nowrap">
                    {r.k}
                  </th>
                  <td
                    className={`border border-[#333] px-[3mm] py-[2mm] ${
                      r.k === "미납 금액" ? "font-extrabold text-[#C22A21]" : ""
                    }`}
                  >
                    {r.v}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {letter.notes.length > 0 && (
            <ul className="mb-[4mm] text-[10pt] text-[#333]">
              {letter.notes.map((n, j) => (
                <li key={j} className="relative mb-[1.2mm] pl-[4mm] before:absolute before:left-0 before:content-['※']">
                  {n}
                </li>
              ))}
            </ul>
          )}

          <div className="flex-1" />

          <p className="mb-[6mm] text-center text-[11pt]">{sentDate}</p>
          <div className="flex items-center justify-center gap-[4mm]">
            {logoImage && (
              // eslint-disable-next-line @next/next/no-img-element -- data URI라 next/image 최적화 대상이 아니다
              <img src={logoImage} alt="아파트 로고" className="size-[10mm] shrink-0 object-contain" />
            )}
            <span className="text-[15pt] font-extrabold tracking-[.06em] whitespace-nowrap">
              {office}
              {!sealImage && (
                <span className="ml-2 text-[9pt] font-semibold tracking-normal text-[#444]">
                  (직인생략)
                </span>
              )}
            </span>
            {sealImage && (
              // eslint-disable-next-line @next/next/no-img-element -- data URI라 next/image 최적화 대상이 아니다
              <img src={sealImage} alt="직인" className="-ml-[3mm] size-[15mm] shrink-0 object-contain" />
            )}
          </div>
          {tel && <p className="mt-[2mm] text-center text-[9.5pt] text-[#222]">{tel}</p>}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: tsc·eslint 확인**

Run: `npx tsc --noEmit && npx eslint src/components/dunning-paper.tsx`
Expected: 통과.

- [ ] **Step 3: Commit**

```bash
git add src/components/dunning-paper.tsx
git commit -F <메시지파일>   # "독촉장은 우편물이다 — 세대당 1장, 기안서급 활자의 A4 렌더러"
```

---

### Task 4: 서버 액션 (`src/app/(app)/modules/dunning/actions.ts`)

**Files:**
- Create: `src/app/(app)/modules/dunning/actions.ts`

**Interfaces:**
- Consumes: `parseDunningRows`, `suggestStage`, `DunningRow`, `DunningStage` (Task 2), `createDocument` (`src/lib/documents.ts`), `isSubscribed` (`src/lib/modules.ts`), `requireRole`·`requireSession` (`src/lib/auth.ts`), `ymdKst` (`src/lib/utils.ts` — "YYYY-MM-DD" KST)
- Produces:
  - `type PreparedRow = DunningRow & { suggestedStage: DunningStage }`
  - `parseDunningExcel(prev, formData): Promise<{ rows?: PreparedRow[]; error?: string }>` — useActionState용
  - `prepareManualRows(rows: DunningRow[]): Promise<PreparedRow[]>` — 직접 입력 경로
  - `createDunningBatch(payload: { rows: (DunningRow & { stage: DunningStage })[]; dueDate: string; account: string }): Promise<{ error: string } | never>` — 성공 시 상세로 redirect
  - `toggleEntryPaid(formData)` — 납부 확인 토글

- [ ] **Step 1: 구현**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Role } from "@/generated/prisma/enums";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { createDocument } from "@/lib/documents";
import {
  parseDunningRows,
  suggestStage,
  type DunningRow,
  type DunningStage,
} from "@/lib/dunning";
import { isSubscribed } from "@/lib/modules";
import { ymdKst } from "@/lib/utils";

export type PreparedRow = DunningRow & { suggestedStage: DunningStage };

/** 독촉은 부과·수납 실무 — 세대 명부 업로드와 같은 권한 + 구독 검사 */
async function requireDunning() {
  const session = await requireRole(Role.DIRECTOR, Role.ACCOUNTANT);
  if (!(await isSubscribed(session.tenantId!, "dunning")))
    throw new Error("미납 독촉장 모듈을 구독 중이 아닙니다.");
  return session;
}

/** 이름은 세대명부에서, 단계는 발송 이력에서 채운다 — 엑셀·직접 입력 공용 */
async function prepareRows(
  tenantId: string,
  rows: DunningRow[],
): Promise<PreparedRow[]> {
  const or = rows.map((r) => ({ dong: r.dong, ho: r.ho }));
  const [units, entries] = await Promise.all([
    db.unit.findMany({
      where: { tenantId, OR: or },
      select: { dong: true, ho: true, name: true },
    }),
    db.dunningEntry.findMany({
      where: { tenantId, OR: or },
      orderBy: { createdAt: "desc" },
      select: { dong: true, ho: true, stage: true, paidAt: true },
    }),
  ]);
  const nameOf = new Map(units.map((u) => [`${u.dong}/${u.ho}`, u.name]));
  // (동,호)별 최신 발송 하나 — desc 정렬이라 처음 만난 것이 최신
  const last = new Map<string, { stage: number; paidAt: Date | null }>();
  for (const e of entries) {
    const k = `${e.dong}/${e.ho}`;
    if (!last.has(k)) last.set(k, e);
  }
  return rows.map((r) => ({
    ...r,
    name: r.name ?? nameOf.get(`${r.dong}/${r.ho}`) ?? null,
    suggestedStage: suggestStage(last.get(`${r.dong}/${r.ho}`)),
  }));
}

export async function parseDunningExcel(
  _prev: { rows?: PreparedRow[]; error?: string } | undefined,
  formData: FormData,
) {
  const session = await requireDunning();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0)
    return { error: "파일을 선택해 주세요." };
  if (file.size > 5 * 1024 * 1024)
    return { error: "5MB 이하 파일만 업로드할 수 있습니다." };

  const XLSX = await import("xlsx");
  let raw: unknown[][];
  try {
    const wb = XLSX.read(await file.arrayBuffer());
    raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
      header: 1,
      raw: false,
    });
  } catch {
    return { error: "파일을 읽을 수 없습니다. 엑셀(.xlsx) 파일인지 확인해 주세요." };
  }
  const { rows, error } = parseDunningRows(raw);
  if (error) return { error };
  return { rows: await prepareRows(session.tenantId!, rows) };
}

export async function prepareManualRows(rows: DunningRow[]) {
  const session = await requireDunning();
  return prepareRows(session.tenantId!, rows);
}

export async function createDunningBatch(payload: {
  rows: (DunningRow & { stage: DunningStage })[];
  dueDate: string; // "YYYY-MM-DD"
  account: string;
}) {
  // 문서·이력을 만드는 입구 — 화면 가드를 믿지 않고 여기서 다시 검사한다
  const session = await requireDunning();
  const tenantId = session.tenantId!;
  const rows = payload.rows.filter(
    (r) => r.dong && r.ho && r.amount > 0 && [1, 2, 3].includes(r.stage),
  );
  if (rows.length === 0) return { error: "발송할 세대가 없습니다." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.dueDate))
    return { error: "납부 기한을 선택해 주세요." };
  const account = payload.account.trim();
  if (!account) return { error: "납부 계좌를 입력해 주세요." };

  const now = new Date();
  const doc = await createDocument({
    tenantId,
    moduleId: "dunning",
    type: "dunning_letter",
    title: `미납 관리비 독촉 — ${now.getFullYear()}년 ${now.getMonth() + 1}월 (${rows.length}세대)`,
    status: "final", // 관리사무소장 명의 즉시 확정 — 공고문과 같은 취급
    createdById: session.userId,
    meta: { dueDate: payload.dueDate, account, sentDate: ymdKst(now) },
  });
  try {
    // 행별 루프 금지 — createMany 한 방 (AGENTS.md)
    await db.dunningEntry.createMany({
      data: rows.map((r) => ({
        tenantId,
        docId: doc.id,
        dong: r.dong,
        ho: r.ho,
        name: r.name,
        amount: r.amount,
        period: r.period,
        stage: r.stage,
      })),
    });
  } catch (e) {
    // 세대 없는 빈 회차를 문서함에 남기지 않는다
    await db.document.delete({ where: { id: doc.id } });
    throw e;
  }
  revalidatePath("/modules/dunning");
  redirect(`/modules/dunning/${doc.id}`);
}

export async function toggleEntryPaid(formData: FormData) {
  const session = await requireDunning();
  const id = String(formData.get("id"));
  const entry = await db.dunningEntry.findFirst({
    where: { id, tenantId: session.tenantId! }, // tenantId가 소유권 검사
  });
  if (!entry) return;
  await db.dunningEntry.update({
    where: { id },
    data: { paidAt: entry.paidAt ? null : new Date() },
  });
  revalidatePath(`/modules/dunning/${entry.docId}`);
  revalidatePath("/modules/dunning");
}
```

주의: `requireRole` 시그니처는 `src/app/(app)/settings/actions.ts`의 사용례(`requireRole(Role.DIRECTOR, Role.ACCOUNTANT)`)를 그대로 따른다. `ymdKst`가 utils에 없는 이름이면 실제 이름을 확인해 맞출 것(알림 페이지가 `ymdKst(n.createdAt)`로 쓰고 있다).

- [ ] **Step 2: tsc 확인**

Run: `npx tsc --noEmit`
Expected: 통과.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/modules/dunning/actions.ts"
git commit -F <메시지파일>   # "독촉 회차 생성 — 입구에서 구독 검사, 세대 행은 createMany 한 방"
```

---

### Task 5: 새 독촉장 마법사 (`/modules/dunning/new`)

**Files:**
- Create: `src/app/(app)/modules/dunning/new/page.tsx`
- Create: `src/app/(app)/modules/dunning/new/dunning-wizard.tsx`

**Interfaces:**
- Consumes: `parseDunningExcel`, `prepareManualRows`, `createDunningBatch`, `PreparedRow` (Task 4), `buildLetter`·`stageLabels`·`koDate` (Task 2), `DunningSheets` (Task 3), `PaperScale`, `FileUpload`, `PageHeader`, `Button`, `Input`
- Produces: 라우트 `/modules/dunning/new`

- [ ] **Step 1: 서버 페이지** (`new/page.tsx`)

```tsx
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSubscribed } from "@/lib/modules";
import { PageHeader } from "@/components/ui/page-header";
import { DunningWizard } from "./dunning-wizard";

export default async function NewDunningPage() {
  const session = await requireSession();
  if (!(await isSubscribed(session.tenantId!, "dunning")))
    redirect("/subscriptions");
  const [tenant, lastDoc] = await Promise.all([
    db.tenant.findUniqueOrThrow({
      where: { id: session.tenantId! },
      select: { name: true, address: true, phone: true, sealImage: true, logoImage: true },
    }),
    // 납부 계좌는 매달 같다 — 지난 회차 값을 기본값으로
    db.document.findFirst({
      where: { tenantId: session.tenantId!, type: "dunning_letter" },
      orderBy: { createdAt: "desc" },
      select: { meta: true },
    }),
  ]);
  const last = (lastDoc?.meta ?? {}) as { account?: string };
  return (
    <>
      <PageHeader
        title="새 독촉장"
        description="미납 세대를 넣으면 단계에 맞는 문서가 세대별로 완성됩니다."
      />
      <DunningWizard
        office={`${tenant.name} 관리사무소`}
        address={tenant.address}
        tel={tenant.phone}
        sealImage={tenant.sealImage}
        logoImage={tenant.logoImage}
        defaultAccount={last.account ?? ""}
      />
    </>
  );
}
```

- [ ] **Step 2: 마법사 클라이언트** (`new/dunning-wizard.tsx`)

3걸음: ① 입력(엑셀/직접) → ② 확인(단계·기한·계좌) → ③ 미리보기·생성. 핵심 골격:

```tsx
"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FileUpload } from "@/components/ui/file-upload";
import { Input } from "@/components/ui/input";
import { PaperScale } from "@/components/paper-scale";
import { DunningSheets } from "@/components/dunning-paper";
import { buildLetter, koDate, stageLabels, type DunningStage } from "@/lib/dunning";
import {
  createDunningBatch,
  parseDunningExcel,
  prepareManualRows,
  type PreparedRow,
} from "../actions";

type Row = PreparedRow & { stage: DunningStage };

export function DunningWizard({
  office, address, tel, sealImage, logoImage, defaultAccount,
}: {
  office: string;
  address: string | null;
  tel: string | null;
  sealImage: string | null;
  logoImage: string | null;
  defaultAccount: string;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [rows, setRows] = useState<Row[]>([]);
  const [dueDate, setDueDate] = useState("");
  const [account, setAccount] = useState(defaultAccount);
  const [pending, startTransition] = useTransition();

  // ① 엑셀 경로 — 파싱·이름 매칭·단계 제안까지 서버가 끝내서 돌려준다
  const [excel, excelAction, excelPending] = useActionState(parseDunningExcel, undefined);
  useEffect(() => {
    if (excel?.rows) {
      setRows(excel.rows.map((r) => ({ ...r, stage: r.suggestedStage })));
      setStep(2);
    }
  }, [excel]);

  // ① 직접 입력 경로 — 표에 쌓은 행을 같은 준비 함수에 통과시킨다
  const [manual, setManual] = useState<
    { dong: string; ho: string; amount: string; name: string; period: string }[]
  >([{ dong: "", ho: "", amount: "", name: "", period: "" }]);
  const submitManual = () => {
    const cleaned = manual
      .filter((m) => m.dong.trim() && m.ho.trim() && Number(m.amount.replace(/[^\d]/g, "")))
      .map((m) => ({
        dong: m.dong.trim().replace(/동$/, ""),
        ho: m.ho.trim().replace(/호$/, ""),
        amount: Number(m.amount.replace(/[^\d]/g, "")),
        name: m.name.trim() || null,
        period: m.period.trim() || null,
      }));
    if (cleaned.length === 0) return toast.error("동·호·미납액을 입력해 주세요.");
    startTransition(async () => {
      const prepared = await prepareManualRows(cleaned);
      setRows(prepared.map((r) => ({ ...r, stage: r.suggestedStage })));
      setStep(2);
    });
  };

  // ③ 생성
  const create = () =>
    startTransition(async () => {
      const result = await createDunningBatch({ rows, dueDate, account });
      if (result?.error) toast.error(result.error); // 성공은 redirect라 여기 안 온다
    });

  const letters = rows.map((r) =>
    buildLetter({
      row: r, stage: r.stage, dueDate: dueDate || "2026-01-01",
      account, office, address,
    }),
  );
  // 이하 step별 렌더: 생략 없이 구현할 것 —
  // step 1: FileUpload 폼(action={excelAction}) + 샘플 다운로드 a[href=/dunning-upload-sample.xlsx]
  //         + 직접 입력 표(동/호/미납액/이름/기간 Input 행, 행 추가·삭제) + [다음]
  // step 2: 행 표 + 행별 stage <select>(stageLabels), 행 삭제 버튼,
  //         Input[type=date] 납부 기한, Input 납부 계좌, [이전]/[미리보기]
  //         단계가 제안과 다르면 "지난 발송 이력 기준 제안: N차" 소자 표시
  // step 3: <PaperScale><DunningSheets letters={letters} docNo="(생성 시 채번)"
  //         sentDate={koDate(오늘 ymd)} office={office} tel={tel}
  //         sealImage={sealImage} logoImage={logoImage} /></PaperScale>
  //         + 요약 한 줄("12세대 · 납부 안내 8 · 납부 최고 3 · 내용증명 1")
  //         + [이전]/[N세대 독촉장 만들기](disabled={pending || !dueDate || !account.trim()})
}
```

구현 시 주의:
- step 3 미리보기는 세대가 많으면 무거우니 **최대 5장까지만** 렌더하고 "외 N세대" 문구(전체는 생성 후 상세에서).
- 검증 문구는 버튼 disabled + toast — "문의하세요" 출구 금지.
- `excel?.error`는 폼 아래 `text-destructive`로 (units-upload.tsx 패턴).

- [ ] **Step 3: tsc·eslint·화면 확인**

Run: `npx tsc --noEmit && npx eslint "src/app/(app)/modules/dunning/"`
브라우저: `http://localhost:3000/modules/dunning/new` (demo 단지는 dunning 구독 중) — 직접 입력 2행 → 단계 제안 1차 → 미리보기 렌더 확인.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/modules/dunning/new/"
git commit -F <메시지파일>   # "독촉장 마법사 — 입력·확인·미리보기 세 걸음, 단계는 이력이 제안한다"
```

---

### Task 6: 모듈 홈 + 회차 상세 + 인쇄 + 문서함 연결

**Files:**
- Create: `src/app/(app)/modules/dunning/page.tsx`
- Create: `src/app/(app)/modules/dunning/dunning-docs-table.tsx`
- Create: `src/app/(app)/modules/dunning/[docId]/page.tsx`
- Create: `src/app/(app)/modules/dunning/[docId]/entries-table.tsx`
- Create: `src/app/(app)/modules/dunning/[docId]/print-button.tsx`
- Modify: `src/app/(app)/documents/page.tsx` (href 매핑 1줄)

**Interfaces:**
- Consumes: Task 2·3·4 산출물, `PrintStyle` (`@/components/gian-paper`), `SummaryBox`·`SummaryStat`, `DataTable`, `EmptyState`, `AttentionCard`, `docStatusLabels`
- Produces: 라우트 `/modules/dunning`, `/modules/dunning/[docId]`

- [ ] **Step 1: 홈** (`page.tsx`)

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { FilePlus2 } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSubscribed } from "@/lib/modules";
import { won } from "@/lib/dunning";
import { ymdKst } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { SummaryBox, SummaryStat } from "@/components/ui/summary-box";
import { Button } from "@/components/ui/button";
import { AttentionCard } from "@/components/attention-card";
import { DunningDocsTable } from "./dunning-docs-table";

export default async function DunningHomePage() {
  const session = await requireSession();
  const tenantId = session.tenantId!;
  if (!(await isSubscribed(tenantId, "dunning"))) redirect("/subscriptions");

  const [docs, entries] = await Promise.all([
    db.document.findMany({
      where: { tenantId, type: "dunning_letter", status: { not: "void" } },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, docNo: true, title: true, createdAt: true },
    }),
    // ponytail: 전량 로드 후 JS 집계 — 회차가 월 1~2회라 수년치도 수천 행이다
    db.dunningEntry.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // (동,호)별 최신 발송 = 그 세대의 현재 상태 (desc라 처음 만난 것이 최신)
  const latest = new Map<string, (typeof entries)[number]>();
  for (const e of entries) {
    const k = `${e.dong}/${e.ho}`;
    if (!latest.has(k)) latest.set(k, e);
  }
  const open = [...latest.values()].filter((e) => !e.paidAt);
  const total = open.reduce((s, e) => s + e.amount, 0);
  const monthAgo = new Date(Date.now() - 30 * 86400000);
  const stale = open.filter((e) => e.createdAt <= monthAgo);
  const perDoc = new Map<string, number>();
  for (const e of entries) perDoc.set(e.docId, (perDoc.get(e.docId) ?? 0) + 1);

  return (
    <>
      <PageHeader title="미납 독촉장" description="미납 세대 독촉 문서를 한 번에 만들고 이력을 관리합니다.">
        <Button asChild size="lg">
          <Link href="/modules/dunning/new"><FilePlus2 className="size-4" /> 새 독촉장</Link>
        </Button>
      </PageHeader>
      {docs.length > 0 && (
        <SummaryBox>
          <SummaryStat label="미납 세대" value={`${open.length}세대`} />
          <SummaryStat label="미납 총액" value={won(total)} />
          <SummaryStat
            label="단계별"
            value={[1, 2, 3]
              .map((s) => `${s}차 ${open.filter((e) => e.stage === s).length}`)
              .join(" · ")}
            note="세대별 최신 발송 기준"
          />
        </SummaryBox>
      )}
      {stale.length > 0 && (
        <AttentionCard
          title={`재발송 검토 대상 ${stale.length}세대`}
          action={<Button asChild variant="outline"><Link href="/modules/dunning/new">다음 단계 발송</Link></Button>}
        >
          마지막 발송 후 30일이 지났는데 납부 확인이 없는 세대입니다:{" "}
          {stale.slice(0, 8).map((e) => `${e.dong}동 ${e.ho}호`).join(", ")}
          {stale.length > 8 && ` 외 ${stale.length - 8}세대`}
        </AttentionCard>
      )}
      <DunningDocsTable
        rows={docs.map((d) => ({
          id: d.id,
          docNo: d.docNo ?? "",
          title: d.title,
          count: perDoc.get(d.id) ?? 0,
          date: ymdKst(d.createdAt),
        }))}
      />
    </>
  );
}
```

- [ ] **Step 2: 회차 목록 표** (`dunning-docs-table.tsx`)

`notifications-table.tsx` 문법을 따른 클라이언트 DataTable: 열 = 문서번호(mono) / 제목(Link → `/modules/dunning/${row.id}`, `hover:underline font-medium`) / 세대수 / 날짜(sortable, mono). `emptyMessage="아직 만든 독촉장이 없습니다"`, `searchPlaceholder="독촉장 검색 — 문서번호·제목"`, `pageSize={15}`.

- [ ] **Step 3: 회차 상세** (`[docId]/page.tsx`)

문서 화면 자리 규칙(메모리): 용지가 본문, 조치·상태는 오른쪽 칸.

```tsx
import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSubscribed } from "@/lib/modules";
import { buildLetter, koDate, type DunningStage } from "@/lib/dunning";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { PaperScale } from "@/components/paper-scale";
import { PrintStyle } from "@/components/gian-paper";
import { DunningSheets } from "@/components/dunning-paper";
import { EntriesTable } from "./entries-table";
import { PrintButton } from "./print-button";

export default async function DunningDocPage({
  params,
}: {
  params: Promise<{ docId: string }>;
}) {
  const session = await requireSession();
  const tenantId = session.tenantId!;
  if (!(await isSubscribed(tenantId, "dunning"))) redirect("/subscriptions");
  const { docId } = await params;
  const doc = await db.document.findFirst({
    where: { id: docId, tenantId, type: "dunning_letter" },
  });
  if (!doc) notFound();
  const [entries, tenant] = await Promise.all([
    db.dunningEntry.findMany({
      where: { docId },
      orderBy: [{ dong: "asc" }, { ho: "asc" }],
    }),
    db.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { name: true, address: true, phone: true, sealImage: true, logoImage: true },
    }),
  ]);
  const meta = (doc.meta ?? {}) as { dueDate: string; account: string; sentDate: string };
  const letters = entries.map((e) =>
    buildLetter({
      row: { dong: e.dong, ho: e.ho, name: e.name, amount: e.amount, period: e.period },
      stage: e.stage as DunningStage,
      dueDate: meta.dueDate, account: meta.account,
      office: `${tenant.name} 관리사무소`, address: tenant.address,
    }),
  );
  const hasProof = entries.some((e) => e.stage === 3);

  return (
    <>
      <PrintStyle target="dunning-sheets" margin="18mm 20mm" />
      <PageHeader title={doc.title} description={doc.docNo ?? ""}>
        <PrintButton />
        {hasProof && (
          <Button asChild variant="outline">
            {/* 내용증명은 우체국 발송이 마지막 걸음 — 인터넷우체국 편지병합에 올릴 수신인 목록 */}
            <a href={`/modules/dunning/${doc.id}/postal`} download>우체국 수신인 목록</a>
          </Button>
        )}
      </PageHeader>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <PaperScale>
          <DunningSheets
            letters={letters} docNo={doc.docNo ?? ""} sentDate={koDate(meta.sentDate)}
            office={`${tenant.name} 관리사무소`} tel={tenant.phone}
            sealImage={tenant.sealImage} logoImage={tenant.logoImage}
          />
        </PaperScale>
        <aside className="w-full shrink-0 lg:w-[340px] print:hidden">
          <EntriesTable
            rows={entries.map((e) => ({
              id: e.id, unit: `${e.dong}동 ${e.ho}호`, name: e.name ?? "",
              amount: e.amount, stage: e.stage, paid: !!e.paidAt,
            }))}
          />
        </aside>
      </div>
    </>
  );
}
```

내용증명이 있으면 안내 한 줄을 aside 위에: "내용증명은 같은 문서 3부를 우체국에 제출합니다. [우체국 수신인 목록]은 인터넷우체국 편지병합용입니다." (AttentionCard 말고 소자 `text-xs text-muted-foreground` — 안내는 색을 가져가지 않는다).

- [ ] **Step 4: 세대 목록 + 납부 토글** (`entries-table.tsx`)

클라이언트 컴포넌트. 열: 세대/이름/단계(`stageLabels`)/미납액(`won`)/납부 확인. 납부 칸은 `<form action={toggleEntryPaid}>` + hidden id + checkbox 스타일 submit 버튼(체크되면 `line-through text-muted-foreground`를 행에). DataTable 없이 단순 `<table>`이어도 된다 — 한 회차는 수십~수백 행, 스크롤 컨테이너(`max-h-[600px] overflow-y-auto`)로.

- [ ] **Step 5: 인쇄 버튼** (`print-button.tsx`)

```tsx
"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintButton() {
  return (
    <Button onClick={() => window.print()}>
      <Printer className="size-4" /> 전체 인쇄
    </Button>
  );
}
```

- [ ] **Step 6: 문서함에서 열리게** (`documents/page.tsx`)

href 매핑을 확장 (현재 approvals만):

```tsx
href:
  d.moduleId === "approvals"
    ? `/modules/approvals/${d.id}`
    : d.type === "dunning_letter"
      ? `/modules/dunning/${d.id}`
      : null,
```

- [ ] **Step 7: 확인 후 Commit**

Run: `npx tsc --noEmit && npx eslint "src/app/(app)/modules/dunning/" "src/app/(app)/documents/page.tsx"`
브라우저: 마법사로 회차 생성 → 상세 렌더·납부 토글·인쇄 미리보기 확인. 문서함에서 독촉 문서 클릭 → 상세로 이동.

```bash
git add "src/app/(app)/modules/dunning/" "src/app/(app)/documents/page.tsx"
git commit -F <메시지파일>   # "독촉 회차의 집 — 홈 요약·재발송 검토·상세 인쇄, 문서함에서도 열린다"
```

---

### Task 7: 우체국 수신인 엑셀 다운로드

**Files:**
- Create: `src/app/(app)/modules/dunning/[docId]/postal/route.ts`

**Interfaces:**
- Consumes: `requireSession`, `db`, xlsx
- Produces: `GET /modules/dunning/[docId]/postal` → xlsx 첨부 응답 (Task 6의 링크가 사용)

- [ ] **Step 1: 인터넷우체국 편지병합 실물 양식 확인**

WebFetch로 `https://service.epost.go.kr` 내용증명 편지병합 안내에서 수신인 파일의 열 구성을 확인한다. 확인 불가 시 기본 열(성명·우편번호·주소)로 가고, 상세 화면 안내 문구에 "인터넷우체국 양식에 맞게 열을 조정해 주세요"를 넣는다(문구는 동작을 따라간다).

- [ ] **Step 2: 구현**

```ts
import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";

/** 내용증명(3차) 세대의 수신인 목록 — 인터넷우체국 편지병합(대량 전자내용증명)용 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ docId: string }> },
) {
  const session = await requireSession();
  const { docId } = await params;
  const doc = await db.document.findFirst({
    where: { id: docId, tenantId: session.tenantId!, type: "dunning_letter" },
    select: { docNo: true },
  });
  if (!doc) return new NextResponse("Not Found", { status: 404 });
  const [tenant, entries] = await Promise.all([
    db.tenant.findUniqueOrThrow({
      where: { id: session.tenantId! },
      select: { address: true },
    }),
    db.dunningEntry.findMany({
      where: { docId, stage: 3 },
      orderBy: [{ dong: "asc" }, { ho: "asc" }],
    }),
  ]);
  if (entries.length === 0)
    return new NextResponse("내용증명 대상 세대가 없습니다.", { status: 404 });

  const XLSX = await import("xlsx");
  const ws = XLSX.utils.aoa_to_sheet([
    ["성명", "우편번호", "주소"],
    ...entries.map((e) => [
      e.name ?? "입주자",
      "", // 우편번호는 단지가 하나뿐 — 사용자가 한 번 채워 넣는다
      [tenant.address, `${e.dong}동 ${e.ho}호`].filter(Boolean).join(" "),
    ]),
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "수신인");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return new NextResponse(buf, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="postal.xlsx"; filename*=UTF-8''${encodeURIComponent(`우체국수신인-${doc.docNo ?? docId}.xlsx`)}`,
    },
  });
}
```

- [ ] **Step 3: 확인 후 Commit**

Run: `npx tsc --noEmit`. 브라우저에서 내용증명 포함 회차의 [우체국 수신인 목록] 클릭 → 파일 내려받아 열 구성 확인.

```bash
git add "src/app/(app)/modules/dunning/[docId]/postal/"
git commit -F <메시지파일>   # "내용증명의 마지막 걸음 — 우체국 편지병합용 수신인 목록"
```

---

### Task 8: 샘플 엑셀 + A4 실측 + 모듈 공개 + 최종 점검

**Files:**
- Create: `public/dunning-upload-sample.xlsx`
- Modify: `prisma/seed.ts:18` (dunning `isActive: true`)

- [ ] **Step 1: 업로드 샘플 파일 생성**

스크래치패드에 스크립트를 쓰고 프로젝트 루트에서 실행 (xlsx는 설치돼 있다):

```js
// make-sample.cjs — node make-sample.cjs
const XLSX = require("xlsx");
const ws = XLSX.utils.aoa_to_sheet([
  ["동", "호", "미납액", "이름(선택)", "미납 기간(선택)"],
  ["101", "502", "456000", "홍길동", "2026년 3월분 ~ 6월분"],
  ["103", "1201", "152000", "", ""],
]);
ws["!cols"] = [{ wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 24 }];
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "미납세대");
XLSX.writeFile(wb, "public/dunning-upload-sample.xlsx");
```

마법사 1걸음의 샘플 다운로드 링크(`/dunning-upload-sample.xlsx`, download 속성 `미납세대_샘플.xlsx`)가 이 파일을 가리키는지 확인.

- [ ] **Step 2: A4 실측**

세 단계 문안 각각 1장씩 스크래치패드 독립 HTML로 렌더(용지 마크업 복사, 폰트는 시스템 대체 허용) → Chrome 헤드리스 `--print-to-pdf`로 페이지 수 확인. **각 단계가 1쪽을 넘지 않아야 한다** (내용증명 최장: 발신·수신 표 + 문단 4 + 표 5행 + 유의 1). 넘치면 여백(`py`)이 아니라 문단 `mb`를 줄인다. 산술 추정 금지.

- [ ] **Step 3: 모듈 공개**

`prisma/seed.ts:18`의 dunning 줄 `isActive: false` → `true`로 바꾸고, 시드 상단 주석 규칙("라우트 구현 전엔 켜지 말 것")과 이제 일치함을 확인. Run: `npx tsx prisma/seed.ts` (upsert라 안전).

- [ ] **Step 4: 전체 점검**

```bash
npx tsx dunning.test.ts
npx tsc --noEmit          # stale .next/types 오류면 해당 라우트 curl로 워밍 후 재실행
npx eslint src/ dunning.test.ts
```
⚠️ `next build`는 dev 서버가 떠 있는 동안 금지.

브라우저 최종 동선: 구독 화면에 "미납 독촉장" 노출 → `/modules/dunning` → 마법사(엑셀 샘플 업로드 + 직접 입력 둘 다) → 생성 → 상세 인쇄 미리보기 → 납부 체크 → 새 회차에서 같은 세대 2차 제안 확인.

- [ ] **Step 5: Commit**

```bash
git add public/dunning-upload-sample.xlsx prisma/seed.ts
git commit -F <메시지파일>   # "미납 독촉장 모듈 공개 — 샘플 양식과 함께 isActive"
```

---

## 계획 밖 (스펙의 범위 외 확정)

이메일 발송(명부에 이메일 없음) · 자동 재발송 크론(발송은 사람 행위) · 생성 알림(자기 문서 알림은 소음) · 납부 자동 대사(데이터 소스 없음). 요청이 생기면 그때.
