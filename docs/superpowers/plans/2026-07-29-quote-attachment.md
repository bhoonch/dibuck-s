# 견적서 첨부 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기안·품의 결재의 증빙을 "체크박스"에서 "실물 견적서 파일"로 바꾼다. 같은 뿌리의 기존 버그(서버 액션 1MB 한도 vs 엑셀 5MB 약속)를 함께 고친다.

**Architecture:** 파일은 `DocumentAttachment` 테이블(Bytes 컬럼)에 저장하고, 브라우저가 이미지를 2000px WebP로 줄여 올린다. 상신 가드는 `rules.ts`의 기존 `Classification.context` 판정을 그대로 쓴다. 긴급 예외 사유는 `meta.quoteWaiver`에 남고 결재 패널 + 인쇄물 양쪽에 표시된다.

**Tech Stack:** Next.js 16(서버 액션·라우트 핸들러), Prisma 7(로컬 PostgreSQL 18), canvas/createImageBitmap(클라이언트 리사이즈, 의존성 0)

**Spec:** `docs/superpowers/specs/2026-07-29-quote-attachment-design.md` — 각 결정의 근거는 스펙에 있다.

## Global Constraints

- **Next.js 16은 훈련 데이터와 다르다** — 낯선 API를 쓰기 전에 `node_modules/next/dist/docs/`의 해당 가이드를 읽는다 (AGENTS.md).
- **셀프서비스 원칙** — 새 문구에 "담당자에게 문의" 류 출구를 만들지 않는다.
- **문구는 동작을 따라간다** — 동작을 바꾸면 관련 문구·주석을 같은 커밋에서 고친다. 이번엔 `attachment-checklist.tsx`의 "파일 스토리지가 없어 업로드는 아직 못 한다" 주석·안내문이 대상이다.
- **타이포·버튼은 앱 공용 체계** — `text-sm`/`text-xs`, 공용 `Button`, 패널 스타일은 `@/components/gian-ui`의 `panel`/`panelTitle`. 하드코딩 px 폰트 금지.
- **날짜는 KST 헬퍼만** — `ymdKst` 등 (`src/lib/utils.ts`). `toISOString().slice(0,10)` 금지.
- **테스트는 루트 `*.test.ts` + `npx tsx`** — 프레임워크 없음, `node:assert/strict`.
- **dev 서버 재시작 함정 (Windows)** — `prisma generate`·`next.config.ts` 변경 후 실행 중인 서버는 죽여야 한다. Git Bash `pkill`은 안 죽는다. Next가 출력한 PID를 PowerShell `Stop-Process -Id NNNN -Force`로 죽일 것. `Get-NetTCPConnection -LocalPort 3000`이 "free"라고 해도 Next가 "Port 3000 is in use by process NNNN"이라 하면 그 NNNN을 죽인다.
- **데모 계정** — test1@test.com(마스터)/test1234, dev DB `dibuck`. 현재 dev 서버가 백그라운드(작업 ID `b9yr9hrq5`)에서 3000 포트로 돌고 있다.
- **브라우저 검증** — `claude-in-chrome` 스킬로 자동화한다. 파일 업로드 input 조작이 안 되면 사용자에게 해당 클릭만 부탁한다(파일 경로를 정확히 알려줄 것).

---

### Task 0: 워킹트리 정리 커밋 (선행, 이 기능과 무관)

이전 세션의 완성분이 미커밋 상태다 — 새 작업 커밋에 섞이면 안 된다.

**Files:**
- 커밋만: `src/app/(app)/layout.tsx`, `src/lib/tenant-deletion.ts`, `tenant-deletion.test.ts`, (staged 삭제) `src/components/layout/deletion-banner.tsx`

- [ ] **Step 1: 기존 테스트로 검증**

Run: `npx tsx tenant-deletion.test.ts`
Expected: `✓ 탈퇴 유예 계산 통과`

- [ ] **Step 2: 커밋**

```bash
git add -A
git commit -m "탈퇴 배너를 레이아웃 인라인으로, 안 쓰는 유예 헬퍼 정리

36줄짜리 배너 컴포넌트가 레이아웃 한 곳에서만 쓰였다.
graceOver·purgeTenant는 purgeExpiredTenants 안으로 접었다 — 밖에서 부를 일이 없다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 1: 서버 액션 body 한도 — 재현 → 수정 → 검증

세대 명부 엑셀이 "5MB 이하"를 약속하면서 실제로는 1MB에서 액션 실행 전에 거절된다(Next 문서 근거, 미재현). **먼저 실패를 눈으로 재현한다** — 재현이 안 되면 이 수정은 근거가 없다.

**Files:**
- Create(임시): `big-units.manual.ts` — 검증 후 삭제, 커밋 안 함
- Create(임시): `clean-999.manual.ts` — 검증 후 삭제, 커밋 안 함
- Modify: `next.config.ts`

**Interfaces:**
- Produces: 서버 액션 body 한도 6MB — Task 4의 업로드 액션(최대 3MB 파일)이 이 위에서 돈다

- [ ] **Step 1: 1.5MB짜리 유효한 엑셀 생성 스크립트 작성**

`big-units.manual.ts` (프로젝트 루트 — scratchpad에 두면 `xlsx` 모듈 해석이 안 된다):

```ts
/** bodySizeLimit 재현용 1MB 초과 엑셀 생성 — npx tsx big-units.manual.ts */
import * as XLSX from "xlsx";
import crypto from "node:crypto";
import fs from "node:fs";

// A·B열만 파서가 읽는다(999동 1~100호). E열은 무시되는 부피용 —
// base64 난수라 압축이 안 먹어 파일이 1MB를 확실히 넘는다.
const rows: string[][] = [["동", "호", "이름", "연락처", "부피"]];
for (let i = 0; i < 100; i++)
  rows.push([
    "999",
    String(i + 1),
    "",
    "",
    crypto.randomBytes(15000).toString("base64"),
  ]);
const ws = XLSX.utils.aoa_to_sheet(rows);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "units");
const out =
  "C:/Temp/claude/D--01--claude-code-dibuck-saas/e1825904-09fb-4fe1-a8b2-bf954fa0a2c4/scratchpad/big-units.xlsx";
XLSX.writeFile(wb, out);
const size = fs.statSync(out).size;
console.log(`${out} — ${(size / 1024 / 1024).toFixed(2)}MB`);
if (size < 1.2 * 1024 * 1024 || size > 5 * 1024 * 1024)
  throw new Error("크기가 목표 범위(1.2~5MB)를 벗어남 — 행 수를 조정할 것");
```

Run: `npx tsx big-units.manual.ts`
Expected: `... — 1.5MB` 근처 값, 에러 없음

- [ ] **Step 2: 수정 전 실패 재현 (브라우저)**

claude-in-chrome으로: `http://localhost:3000/login` → test1@test.com / test1234 로그인 → 설정 > 세대 관리(`/settings/units`) → 위 xlsx 업로드 시도.

Expected: **실패.** "5MB 이하…" 메시지가 아니라 일반 오류(액션 자체가 실행되지 않으므로)가 나거나 dev 오버레이에 "Body exceeded 1 MB limit" 류가 뜬다. dev 서버 로그(`C:\Temp\claude\D--01--claude-code-dibuck-saas\e1825904-09fb-4fe1-a8b2-bf954fa0a2c4\tasks\b9yr9hrq5.output`)에서도 확인한다.

**재현이 안 되고 업로드가 성공하면 여기서 멈추고 사용자에게 보고한다** — config 수정의 근거가 사라진 것이므로 Task 1을 통째로 접는다(파일 삭제·정리 후 Task 2로).

- [ ] **Step 3: next.config.ts 수정**

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // 서버 액션 body 기본 한도는 1MB — 세대 명부 엑셀(5MB 약속)과
      // 견적서 첨부(3MB)가 그보다 크다. multipart 오버헤드 여유까지 6MB.
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
```

- [ ] **Step 4: dev 서버 재시작**

next.config 변경은 자동 반영되지 않는다. Global Constraints의 Windows 함정 절차대로 기존 서버(작업 `b9yr9hrq5`)를 죽이고 `npm run dev`를 백그라운드로 다시 띄운 뒤, `curl -s -o /dev/null -w "%{http_code}" --max-time 240 http://localhost:3000/login`이 200을 줄 때까지 확인.

- [ ] **Step 5: 수정 후 같은 파일로 성공 확인 (브라우저)**

같은 경로로 같은 파일 업로드.
Expected: **"100세대를 등록했습니다."** (999동 1~100호)

- [ ] **Step 6: 테스트 데이터 정리**

`clean-999.manual.ts` (DB 부트스트랩 방식은 `billing-run.test.ts` 머리 부분과 동일하게 맞출 것):

```ts
/** Task 1 검증용 999동 삭제 — npx tsx clean-999.manual.ts */
import { db } from "./src/lib/db";

async function main() {
  const user = await db.user.findUniqueOrThrow({
    where: { email: "test1@test.com" },
  });
  const r = await db.unit.deleteMany({
    where: { tenantId: user.tenantId!, dong: "999" },
  });
  console.log(`deleted ${r.count}`);
}
main().then(() => process.exit(0));
```

Run: `npx tsx clean-999.manual.ts` → `deleted 100`
그다음 두 임시 스크립트와 xlsx를 삭제한다:

```bash
rm big-units.manual.ts clean-999.manual.ts
rm "C:/Temp/claude/D--01--claude-code-dibuck-saas/e1825904-09fb-4fe1-a8b2-bf954fa0a2c4/scratchpad/big-units.xlsx"
```

- [ ] **Step 7: 커밋**

```bash
git add next.config.ts
git commit -m "서버 액션 body 한도 6MB — 엑셀 5MB 약속이 1MB에서 거절되던 것

세대 명부 업로드가 \"5MB 이하 파일만\"이라고 안내하면서 실제로는
기본 한도 1MB에서 액션 실행 전에 거절됐다 — 그 메시지조차 못 본다.
1.5MB 엑셀로 실패를 재현하고 수정 후 같은 파일로 통과 확인.
견적서 첨부(3MB)도 이 한도 위에서 돈다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: DocumentAttachment 스키마 + 마이그레이션

**Files:**
- Modify: `prisma/schema.prisma` — `Document` 모델(관계 1줄) + 새 모델

**Interfaces:**
- Produces: `db.documentAttachment` — `{ id, documentId, quoteIndex: number|null, name, mime, size, sha256, data: Uint8Array|null, createdAt }`. 이후 모든 태스크가 쓴다.

- [ ] **Step 1: 스키마 수정**

`Document` 모델 안(기존 `approvalSteps ApprovalStep[]` 줄 옆)에 추가:

```prisma
  attachmentFiles DocumentAttachment[]
```

파일 끝(또는 Document 모델 아래)에 새 모델:

```prisma
/// 결재 문서의 실물 증빙 — 견적서 사진·PDF. 파일 스토리지가 없어 DB에 담는다.
/// Document.attachments(Json)와 다르다: 거기는 목록 문구, 여기는 파일 본문.
model DocumentAttachment {
  id         String   @id @default(cuid())
  documentId String
  document   Document @relation(fields: [documentId], references: [id], onDelete: Cascade)
  /// meta.quotes 배열 위치 — 어느 업체의 견적서인가. null = 문서 단위 첨부(입찰 산출근거 등)
  quoteIndex Int?
  name       String
  mime       String
  size       Int
  /// 결재 당시 파일의 지문 — 사후 위변조 검증용. data를 비워도 남는다
  sha256     String
  /// 문서 폐기(void) 시 null — 이름·해시는 기록으로 남고 용량만 회수
  data       Bytes?
  createdAt  DateTime @default(now())

  @@index([documentId])
}
```

- [ ] **Step 2: 마이그레이션 생성·적용**

Run: `npx prisma migrate dev --name document_attachment`
Expected: 새 폴더 `prisma/migrations/*_document_attachment/`, 적용 성공. (`migrate dev`가 `prisma generate`까지 돌린다)

- [ ] **Step 3: dev 서버 재시작**

구버전 Prisma 클라이언트 캐시 때문에 필수 (Global Constraints의 절차). 재시작 후 `/login` 200 확인.

- [ ] **Step 4: 커밋**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "견적서 첨부 테이블 — 파일은 Json이 아니라 별도 테이블에

Document.attachments(Json)에 base64를 넣으면 문서를 읽을 때마다
파일이 통째로 딸려온다. 별도 테이블이면 data를 고르지 않는 한 안 온다.
폐기 시 data만 null — 이름·해시는 결재 기록으로 남는다.
탈퇴 삭제는 onDelete: Cascade가 처리해 purgeExpiredTenants 무변경.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 첨부 판정 순수 함수 (TDD)

**Files:**
- Create: `src/lib/gian/attachments.ts`
- Test: `gian-attachment.test.ts` (프로젝트 루트, DB 불필요)

**Interfaces:**
- Consumes: `ContractContext` 타입 (`./rules`)
- Produces:
  - `quoteFileGap(context: ContractContext, quotes: {vendor: string}[], files: {quoteIndex: number|null}[]): string | null` — null이면 증빙 충분, 아니면 부족 설명(사람이 읽는 한국어)
  - `MAX_FILE_BYTES = 3 * 1024 * 1024`, `MAX_FILES_PER_QUOTE = 3`, `MAX_FILES_PER_DOC = 9`
  - `allowedMime(mime: string): boolean`

- [ ] **Step 1: 실패하는 테스트 작성**

`gian-attachment.test.ts`:

```ts
/**
 * 견적서 첨부 판정 검증 — `npx tsx gian-attachment.test.ts` (DB 불필요)
 * 이 판정이 상신 차단의 기준이다: 수의계약은 업체마다, 입찰은 문서에 1장.
 */
import assert from "node:assert/strict";
import { quoteFileGap } from "./src/lib/gian/attachments";

const q = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ vendor: `업체${i + 1}` }));
const f = (...idx: (number | null)[]) => idx.map((quoteIndex) => ({ quoteIndex }));

// 예산 없는 기안 — 강제하지 않는다 (사용자 결정)
assert.equal(quoteFileGap("none", [], []), null);

// 수의계약 — 입력된 업체 전부, 각각 1장 이상
assert.notEqual(quoteFileGap("direct", q(2), []), null);
assert.notEqual(quoteFileGap("direct", q(2), f(0)), null);
assert.equal(quoteFileGap("direct", q(2), f(0, 1)), null);
// 한 업체에 몰아 올려도 2인 견적이 되지 않는다
assert.notEqual(quoteFileGap("direct", q(2), f(0, 0)), null);
// 3곳 적었으면 3곳 전부 — 비교표에 실린 금액은 전부 증빙 (사용자 결정)
assert.notEqual(quoteFileGap("direct", q(3), f(0, 1)), null);
assert.equal(quoteFileGap("direct", q(3), f(0, 1, 2)), null);
// 문서 단위 첨부는 업체 증빙을 대신하지 못한다
assert.notEqual(quoteFileGap("direct", q(2), f(null, null)), null);
// 업체당 여러 장은 괜찮다
assert.equal(quoteFileGap("direct", q(2), f(0, 0, 1)), null);
// 부족 메시지에 빠진 업체명이 들어간다 — 사용자가 뭘 올려야 하는지 안다
assert.ok(quoteFileGap("direct", q(2), f(0))!.includes("업체2"));

// 입찰 — 견적서를 받는 절차가 아니다. 아무 첨부 1장(산출근거 등)이면 충분
assert.notEqual(quoteFileGap("bid", [], []), null);
assert.equal(quoteFileGap("bid", [], f(null)), null);
assert.equal(quoteFileGap("bid", q(2), f(0)), null); // 업체 줄 첨부도 증빙이다

console.log("✓ 견적서 첨부 판정 통과");
```

- [ ] **Step 2: 실패 확인**

Run: `npx tsx gian-attachment.test.ts`
Expected: FAIL — `Cannot find module './src/lib/gian/attachments'`

- [ ] **Step 3: 구현**

`src/lib/gian/attachments.ts`:

```ts
import type { ContractContext } from "./rules";

/**
 * 견적서 첨부 정책 — 판정은 전부 여기(결정적 코드). rules.ts의 분류가 입력이다.
 * 수의계약(direct)은 비교표의 업체 전부에 실물 견적서가 붙어야 상신된다.
 */

/** 파일 하나 상한 — 이미지는 브라우저가 ~250KB로 줄여 오지만 서버가 최종선이다 */
export const MAX_FILE_BYTES = 3 * 1024 * 1024;
export const MAX_FILES_PER_QUOTE = 3;
export const MAX_FILES_PER_DOC = 9;

export const allowedMime = (mime: string) =>
  mime.startsWith("image/") || mime === "application/pdf";

/** 상신에 모자란 증빙 설명. null이면 충분하다 */
export function quoteFileGap(
  context: ContractContext,
  quotes: { vendor: string }[],
  files: { quoteIndex: number | null }[],
): string | null {
  if (context === "none") return null; // 예산 없는 문서는 강제하지 않는다
  if (context === "bid")
    // 전자입찰은 견적서를 받는 절차가 아니다 — 산출근거 등 아무 증빙 1장
    return files.length > 0
      ? null
      : "추정가격 산출근거 등 증빙 서류 1건이 필요합니다";
  // direct: 비교표에 실린 업체 전부 — 일부만 증빙하면 나머지 줄은 검증 안 된 숫자다
  const missing = quotes
    .map((q, i) => (files.some((x) => x.quoteIndex === i) ? null : q.vendor))
    .filter((v): v is string => !!v);
  return missing.length > 0
    ? `${missing.join("·")}의 견적서가 첨부되지 않았습니다`
    : null;
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx tsx gian-attachment.test.ts`
Expected: `✓ 견적서 첨부 판정 통과`

- [ ] **Step 5: 커밋**

```bash
git add src/lib/gian/attachments.ts gian-attachment.test.ts
git commit -m "견적서 첨부 판정 — 수의계약은 업체 전부, 입찰은 문서에 1장

판정 기준은 rules.ts의 context를 그대로 쓴다(새 규칙 엔진 없음).
direct에서 문서 단위 첨부가 업체 증빙을 대신하지 못하는 것,
한 업체에 몰아 올려도 안 되는 것이 경계값이다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 업로드·삭제 서버 액션 + 열람 라우트

**Files:**
- Modify: `src/app/(app)/modules/approvals/approval-actions.ts` — 파일 끝에 액션 2개 추가 (기존 `myDoc` 경계를 재사용하려고 같은 파일에 둔다)
- Create: `src/app/api/attachments/[id]/route.ts`

**Interfaces:**
- Consumes: `myDoc(docId)` (approval-actions.ts 로컬), `allowedMime`/`MAX_*` (Task 3), `db.documentAttachment` (Task 2), `getSession` (`@/lib/auth`)
- Produces:
  - `uploadQuoteFile(_prev: ActionState, formData: FormData): Promise<ActionState>` — formData: `docId`, `quoteIndex`(빈 문자열 = 문서 단위), `file`
  - `deleteQuoteFile(attachmentId: string): Promise<ActionState>`
  - `GET /api/attachments/[id]` — 같은 단지만, inline 스트림

- [ ] **Step 1: 서버 액션 2개 추가**

`approval-actions.ts` 상단 import에 추가:

```ts
import crypto from "node:crypto";
import {
  allowedMime,
  MAX_FILE_BYTES,
  MAX_FILES_PER_DOC,
  MAX_FILES_PER_QUOTE,
} from "@/lib/gian/attachments";
```

파일 끝에:

```ts
/**
 * 견적서 파일 첨부 — 결재 전 문서만. 브라우저가 이미지를 줄여 보내지만
 * 여기가 신뢰 경계라 mime·크기·개수·소유권을 전부 다시 확인한다.
 */
export async function uploadQuoteFile(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const docId = String(formData.get("docId") ?? "");
  const rawIdx = String(formData.get("quoteIndex") ?? "");
  const quoteIndex = rawIdx === "" ? null : Number(rawIdx);
  if (quoteIndex !== null && (!Number.isInteger(quoteIndex) || quoteIndex < 0))
    return { error: "잘못된 요청입니다." };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0)
    return { error: "파일을 선택해 주세요." };
  if (!allowedMime(file.type))
    return { error: "이미지 또는 PDF만 첨부할 수 있습니다." };
  if (file.size > MAX_FILE_BYTES)
    return {
      error:
        "3MB 이하만 첨부할 수 있습니다. 종이 견적서는 사진으로 찍어 올리면 자동으로 줄어듭니다.",
    };

  const { doc } = await myDoc(docId);
  if (!doc) return { error: "문서를 찾을 수 없습니다." };
  if (doc.status !== "draft" && doc.status !== "rejected")
    return { error: "결재가 시작된 문서에는 첨부할 수 없습니다." };

  const existing = await db.documentAttachment.findMany({
    where: { documentId: doc.id },
    select: { quoteIndex: true },
  });
  if (existing.length >= MAX_FILES_PER_DOC)
    return { error: `문서당 ${MAX_FILES_PER_DOC}장까지 첨부할 수 있습니다.` };
  if (
    quoteIndex !== null &&
    existing.filter((x) => x.quoteIndex === quoteIndex).length >=
      MAX_FILES_PER_QUOTE
  )
    return { error: `업체당 ${MAX_FILES_PER_QUOTE}장까지 첨부할 수 있습니다.` };

  const buf = Buffer.from(await file.arrayBuffer());
  await db.documentAttachment.create({
    data: {
      documentId: doc.id,
      quoteIndex,
      name: file.name,
      mime: file.type,
      size: buf.byteLength,
      // 결재 당시 파일의 지문 — 나중에 "그때 그 파일인가"를 검증한다
      sha256: crypto.createHash("sha256").update(buf).digest("hex"),
      data: buf,
    },
  });
  revalidatePath(`/modules/approvals/${doc.id}`);
  return undefined;
}

/** 첨부 삭제 — 결재 전 문서만 (상신 후 바꿔치기 방지는 업로드와 같은 가드) */
export async function deleteQuoteFile(
  attachmentId: string,
): Promise<ActionState> {
  const session = await requireSession();
  const att = await db.documentAttachment.findUnique({
    where: { id: attachmentId },
    include: {
      document: {
        select: { id: true, tenantId: true, status: true, moduleId: true },
      },
    },
  });
  if (
    !att ||
    att.document.tenantId !== session.tenantId ||
    att.document.moduleId !== "approvals"
  )
    return { error: "파일을 찾을 수 없습니다." };
  if (att.document.status !== "draft" && att.document.status !== "rejected")
    return { error: "결재가 시작된 문서의 첨부는 지울 수 없습니다." };
  await db.documentAttachment.delete({ where: { id: attachmentId } });
  revalidatePath(`/modules/approvals/${att.document.id}`);
  return undefined;
}
```

- [ ] **Step 2: 열람 라우트**

`src/app/api/attachments/[id]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * 첨부 열람 — 신뢰 경계. 같은 단지의 로그인 사용자만.
 * 이 확인이 없으면 id만 알면 남의 단지 견적서를 읽는다.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.tenantId)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const att = await db.documentAttachment.findUnique({
    where: { id: (await params).id },
    include: { document: { select: { tenantId: true } } },
  });
  if (!att || att.document.tenantId !== session.tenantId)
    return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!att.data)
    // 폐기된 문서 — 파일 본문은 비웠고 이름·해시만 기록으로 남아 있다
    return NextResponse.json({ error: "purged" }, { status: 410 });

  return new NextResponse(Buffer.from(att.data), {
    headers: {
      "Content-Type": att.mime,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(att.name)}`,
      "Cache-Control": "private, max-age=0",
    },
  });
}
```

주의: `getSession`의 정확한 export명·시그니처는 `src/lib/auth.ts`에서 확인하고 맞출 것 (세션이 null일 수 있는 조회용 함수를 쓴다 — `requireSession`은 redirect라 API 응답에 안 맞는다).

- [ ] **Step 3: 타입·린트 확인**

Run: `npx tsc --noEmit && npm run lint`
Expected: 에러 0 (경고는 기존 수준 유지)

- [ ] **Step 4: 비로그인 401 확인**

Run: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/attachments/nonexistent`
Expected: `401`

- [ ] **Step 5: 커밋**

```bash
git add "src/app/(app)/modules/approvals/approval-actions.ts" "src/app/api/attachments/[id]/route.ts"
git commit -m "견적서 업로드·삭제 액션 + 열람 라우트

업로드·삭제는 결재 전(draft·rejected)만 — 결재 중 바꿔치기를 막는다.
서버가 mime·크기·개수·소유권을 다시 확인한다(브라우저를 믿지 않는다).
열람은 같은 단지만: 이 한 줄이 없으면 id로 남의 견적서를 읽는다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: 업로드 UI — 견적 줄에 파일 슬롯

**Files:**
- Create: `src/app/(app)/modules/approvals/[docId]/quote-files.tsx`
- Modify: `src/app/(app)/modules/approvals/[docId]/page.tsx` — Meta 타입 확장, 첨부 조회, 패널에 렌더
- Modify: `src/app/(app)/modules/approvals/[docId]/attachment-checklist.tsx` — 거짓이 된 문구 2곳
- Create(임시 아님, 커밋함): `gian-attachment.manual.ts` — 검증용 초안 문서 생성 (AI 호출 없음, `gian-draft.manual.ts`와 같은 관례)

**Interfaces:**
- Consumes: `uploadQuoteFile`/`deleteQuoteFile` (Task 4), `panel`/`panelTitle` (`@/components/gian-ui`)
- Produces: `QuoteFiles({ docId, vendors: string[], files: FileRow[], showDocSlot: boolean, editable: boolean })`, `FileRow = { id: string; name: string; size: number; quoteIndex: number | null }`

- [ ] **Step 1: QuoteFiles 컴포넌트**

`quote-files.tsx`:

```tsx
"use client";

import { useRef, useState, useTransition } from "react";
import { FileText, Loader2, Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { panel, panelTitle } from "@/components/gian-ui";
import { deleteQuoteFile, uploadQuoteFile } from "../approval-actions";

export type FileRow = {
  id: string;
  name: string;
  size: number;
  quoteIndex: number | null;
};

/**
 * 폰으로 찍은 견적서(5MB급)를 올리기 전에 줄인다 — 장변 2000px WebP.
 * 2000px ≈ A4 171DPI라 표의 작은 글씨까지 읽힌다. 라이브러리 없이 canvas만.
 * 디코딩 실패(HEIC 등)면 원본 그대로 — 서버 3MB 상한이 최종선이다.
 */
async function shrinkImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
  if (scale === 1 && file.size < 500 * 1024) return file; // 이미 작으면 그대로
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((res) =>
    canvas.toBlob(res, "image/webp", 0.8),
  );
  if (!blob) return file;
  return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".webp", {
    type: "image/webp",
  });
}

const kb = (n: number) => `${Math.max(1, Math.round(n / 1024))}KB`;

function Slot({
  docId,
  label,
  quoteIndex,
  files,
  editable,
  onError,
}: {
  docId: string;
  label: string;
  quoteIndex: number | null;
  files: FileRow[];
  editable: boolean;
  onError: (msg?: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = (file: File) => {
    onError(undefined);
    startTransition(async () => {
      const shrunk = await shrinkImage(file);
      const fd = new FormData();
      fd.set("docId", docId);
      fd.set("quoteIndex", quoteIndex === null ? "" : String(quoteIndex));
      fd.set("file", shrunk);
      const r = await uploadQuoteFile(undefined, fd);
      if (r?.error) onError(r.error);
    });
  };

  return (
    <li className="text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">{label}</span>
        {editable && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = ""; // 같은 파일 재선택도 change가 나게
                if (f) upload(f);
              }}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => inputRef.current?.click()}
            >
              {pending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Paperclip className="size-3.5" />
              )}
              올리기
            </Button>
          </>
        )}
      </div>
      {files.length === 0 ? (
        <p className="mt-0.5 text-xs text-[var(--gian-ink-soft)]">
          {editable ? "견적서 사진·PDF를 올려 주세요" : "첨부 없음"}
        </p>
      ) : (
        <ul className="mt-1 space-y-1">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-1.5 text-xs">
              <FileText className="size-3.5 shrink-0 text-[var(--gian-ink-soft)]" />
              <a
                href={`/api/attachments/${f.id}`}
                target="_blank"
                rel="noreferrer"
                className="truncate underline underline-offset-2"
              >
                {f.name}
              </a>
              <span className="shrink-0 font-mono text-[var(--gian-ink-soft)]">
                {kb(f.size)}
              </span>
              {editable && (
                <button
                  type="button"
                  aria-label="첨부 삭제"
                  className="shrink-0 text-[var(--gian-ink-soft)] hover:text-destructive"
                  onClick={() => {
                    onError(undefined);
                    startTransition(async () => {
                      const r = await deleteQuoteFile(f.id);
                      if (r?.error) onError(r.error);
                    });
                  }}
                >
                  <X className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** 견적서 첨부 패널 — 업체마다 한 슬롯, 입찰이면 문서 단위 슬롯 하나 */
export function QuoteFiles({
  docId,
  vendors,
  files,
  showDocSlot,
  editable,
}: {
  docId: string;
  vendors: string[];
  files: FileRow[];
  showDocSlot: boolean;
  editable: boolean;
}) {
  const [error, setError] = useState<string>();
  return (
    <div className={panel}>
      <h4 className={panelTitle}>견적서 첨부</h4>
      <ul className="space-y-2.5">
        {vendors.map((v, i) => (
          <Slot
            key={i}
            docId={docId}
            label={v}
            quoteIndex={i}
            files={files.filter((f) => f.quoteIndex === i)}
            editable={editable}
            onError={setError}
          />
        ))}
        {showDocSlot && (
          <Slot
            docId={docId}
            label="증빙 서류 (산출근거 등)"
            quoteIndex={null}
            files={files.filter((f) => f.quoteIndex === null)}
            editable={editable}
            onError={setError}
          />
        )}
      </ul>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: 페이지 연결**

`[docId]/page.tsx`:

(a) `Meta` 타입에 두 필드 추가:

```ts
  quotes?: { vendor: string; amount: number }[];
  /** 견적서 없이 상신한 긴급 예외 — 사유는 결재 패널과 인쇄물 양쪽에 남는다 */
  quoteWaiver?: { reason: string; byName: string; at: string };
```

(b) import 추가:

```ts
import { quoteFileGap } from "@/lib/gian/attachments";
import { QuoteFiles } from "./quote-files";
```

(c) `canEdit` 계산 아래에 조회·판정 추가:

```ts
  // 첨부 파일 — data(Bytes)는 절대 select하지 않는다 (목록 쿼리에 파일이 딸려온다)
  const attachmentFiles = await db.documentAttachment.findMany({
    where: { documentId: doc.id },
    select: { id: true, name: true, size: true, quoteIndex: true },
    orderBy: { createdAt: "asc" },
  });
  const quotes = meta.quotes ?? [];
  const gap = meta.cls
    ? quoteFileGap(meta.cls.context, quotes, attachmentFiles)
    : null;
  // 파일이 채워지면 waiver는 안 쓴다 — 부족한 채 상신했을 때만 사유가 문서에 남는다
  const waiverNote =
    gap && meta.quoteWaiver
      ? `※ 견적서 미첨부 — 사유: ${meta.quoteWaiver.reason} (${meta.quoteWaiver.at} ${meta.quoteWaiver.byName})`
      : null;
```

(d) aside에서 `<ApprovalPanel …/>`과 `<AttachmentChecklist …/>` 사이에 렌더:

```tsx
            {meta.cls && meta.cls.context !== "none" && (
              <QuoteFiles
                docId={doc.id}
                vendors={quotes.map((q) => q.vendor)}
                files={attachmentFiles}
                showDocSlot={meta.cls.context === "bid"}
                editable={canEdit}
              />
            )}
```

(이 Task에서는 `waiverNote`를 만들어 두기만 한다 — 패널·인쇄물 연결은 Task 6·7.)

- [ ] **Step 3: 거짓이 된 문구 수정**

`attachment-checklist.tsx` — 이제 업로드가 실제로 있으므로:

파일 머리 주석(7~11행)을:

```tsx
/**
 * 첨부 체크리스트 — "무엇을 붙여야 하는지" 목록이다. 견적서 실물은
 * 견적서 첨부 패널이 받고, 그 외 서류(등기부 등)는 여기 체크로 확인만 남긴다.
 * 체크는 문서에 남겨서 결재자가 "첨부 확인했다"를 볼 수 있게 한다.
 */
```

하단 안내문(67~72행)을:

```tsx
      {editable && state.length < items.length && (
        <p className="mt-2 text-xs text-[var(--gian-ink-soft)]">
          견적서 파일은 위 &lsquo;견적서 첨부&rsquo;에 올려 주세요. 여기 체크는
          빠뜨린 서류가 없는지 확인용입니다.
        </p>
      )}
```

- [ ] **Step 4: 검증용 초안 문서 스크립트**

`gian-attachment.manual.ts` (프로젝트 루트 — AI 호출 없이 수의계약 품의 초안을 만든다. DB 부트스트랩은 `billing-run.test.ts` 방식과 동일하게):

```ts
/**
 * 견적서 첨부 검증용 초안(수의계약 품의, 견적 2곳)을 dev DB에 만든다.
 * npx tsx gian-attachment.manual.ts — AI 호출 없음(비용 0). 문서 URL을 찍는다.
 */
import { db } from "./src/lib/db";
import { createDocument } from "./src/lib/documents";
import { classify, legalNoticesFor } from "./src/lib/gian/rules";

async function main() {
  const user = await db.user.findUniqueOrThrow({
    where: { email: "test1@test.com" },
  });
  const quotes = [
    { vendor: "한빛방수", amount: 3_300_000 },
    { vendor: "튼튼설비", amount: 3_520_000 },
  ];
  const cls = classify({
    amountRaw: 3_300_000,
    vatIncluded: true,
    texts: ["누수 부분 보수"],
    fund: "maintenance",
    budgeted: true,
  });
  const draft = {
    title: "지하주차장 누수 부분 보수공사 시행의 건",
    legalBasis: ["공동주택관리법 제63조(관리주체의 업무)"],
    sections: [
      {
        heading: "추진 목적",
        lines: [
          "가. 지하주차장 천장 누수로 차량 피해 민원이 접수되어 보수가 필요함.",
        ],
      },
      {
        heading: "공사 개요",
        lines: [
          "가. 공 사 명: 지하주차장 누수 부분 보수공사",
          "나. 소요예산: 금 3,300,000원 (금삼백삼십만원 / VAT 포함)",
        ],
      },
    ],
    attachments: ["견적서 2부.", "사업자등록증 사본 1부."],
    legalNotices: legalNoticesFor(cls),
    needsClarification: [],
  };
  const doc = await createDocument({
    tenantId: user.tenantId!,
    moduleId: "approvals",
    type: "approval",
    title: draft.title,
    content: draft.title,
    meta: {
      form: {
        work: "지하주차장 누수 부분 보수공사",
        location: "지하주차장",
        why: "누수 민원",
        schedule: "",
        amount: 3_300_000,
        vatIncluded: true,
        fund: "maintenance",
        budgeted: true,
      },
      quotes,
      cls,
      draft,
      plannedSteps: [],
    },
    status: "draft",
    createdById: user.id,
  });
  console.log(`http://localhost:3000/modules/approvals/${doc.id}`);
}
main().then(() => process.exit(0));
```

Run: `npx tsx gian-attachment.manual.ts` → URL 출력. `npx tsc --noEmit && npm run lint`도 통과 확인.

- [ ] **Step 5: 브라우저 검증**

출력된 URL을 claude-in-chrome으로 열어 (test1 로그인 상태):
1. 결재 패널 아래 "견적서 첨부" 패널에 한빛방수·튼튼설비 슬롯이 보인다.
2. 큰 사진(3MB 이상, 없으면 scratchpad에 생성)을 한빛방수에 올린다 → 목록에 `*.webp`로 뜨고 크기가 수백 KB다.
3. 파일명 클릭 → 새 탭에서 이미지가 열린다 (`/api/attachments/...`).
4. X로 삭제 → 목록에서 사라진다.
5. 다시 올려 둔다(다음 Task에서 쓴다).

DB 용량 확인 (스펙 성공 기준 4) — 일회성 스크립트:

```ts
// 일회성 — npx tsx check-att-size.manual.ts (확인 후 삭제)
import { db } from "./src/lib/db";
async function main() {
  const rows = await db.documentAttachment.findMany({
    select: { name: true, size: true },
  });
  console.log(rows);
  for (const r of rows)
    if (r.size >= 400 * 1024) throw new Error(`${r.name} ${r.size}B ≥ 400KB`);
  console.log("✓ 전부 400KB 미만");
}
main().then(() => process.exit(0));
```

Expected: 사진 업로드분이 400KB 미만. 확인 후 `rm check-att-size.manual.ts`.

- [ ] **Step 6: 커밋**

```bash
git add "src/app/(app)/modules/approvals/[docId]/quote-files.tsx" "src/app/(app)/modules/approvals/[docId]/page.tsx" "src/app/(app)/modules/approvals/[docId]/attachment-checklist.tsx" gian-attachment.manual.ts
git commit -m "견적 줄에 파일 슬롯 — 폰 사진은 올리기 전에 줄인다

업체마다 슬롯 하나, 입찰이면 문서 단위 슬롯. 5MB급 사진은
canvas 2000px WebP로 ~250KB가 돼서 서버·DB 부담이 없다.
첨부 체크리스트의 \"업로드는 아직 못 한다\" 문구도 같이 고쳤다 —
동작이 바뀌면 문구가 따라간다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: 상신 가드 + 긴급 예외

**Files:**
- Modify: `src/app/(app)/modules/approvals/approval-actions.ts` — `submitGian`
- Modify: `src/app/(app)/modules/approvals/[docId]/approval-panel.tsx` — 사유 입력 UI
- Modify: `src/app/(app)/modules/approvals/[docId]/page.tsx` — 패널에 `waiverNote` 전달

**Interfaces:**
- Consumes: `quoteFileGap` (Task 3), `db.documentAttachment` (Task 2), Task 5의 `waiverNote` 계산
- Produces:
  - `submitGian(docId: string, waiverReason?: string): Promise<{ error?: string; needWaiver?: boolean } | undefined>` — `needWaiver: true`면 패널이 사유 입력을 연다
  - `ApprovalPanel` props에 `waiverNote?: string | null` 추가

- [ ] **Step 1: submitGian에 가드**

`approval-actions.ts` — import에 `quoteFileGap`(이미 attachments import 줄이 있다), `ymdKst`(`@/lib/utils`), `Classification` 타입(`@/lib/gian/rules`) 추가. `submitGian`을 교체:

```ts
export async function submitGian(
  docId: string,
  waiverReason?: string,
): Promise<{ error?: string; needWaiver?: boolean } | undefined> {
  const { session, doc } = await myDoc(docId);
  if (!doc) return { error: "문서를 찾을 수 없습니다." };
  // 상신은 작성자·마스터·매니저 — 남의 초안을 아무나 결재에 올리지 못하게 막되,
  // 지출 문서를 실제로 챙기는 매니저는 올릴 수 있어야 한다
  if (doc.createdById !== session.userId && !canSubmitOthers(session.role))
    return { error: "작성자·마스터·매니저만 상신할 수 있습니다." };

  // 증빙 가드 — 결재 시스템의 증거는 체크박스가 아니라 실물 파일이다
  const meta = doc.meta as {
    cls?: Classification;
    quotes?: { vendor: string; amount: number }[];
    quoteWaiver?: { reason: string };
  } | null;
  if (meta?.cls) {
    const files = await db.documentAttachment.findMany({
      where: { documentId: doc.id },
      select: { quoteIndex: true },
    });
    const gap = quoteFileGap(meta.cls.context, meta.quotes ?? [], files);
    if (gap && !meta.quoteWaiver) {
      const reason = waiverReason?.trim();
      if (!reason)
        // 긴급 예외 — 사유를 적으면 통과하되, 그 사유가 결재선과 인쇄물에 남는다
        return { error: `${gap}. 파일을 첨부하거나 긴급 사유를 적어 주세요.`, needWaiver: true };
      const user = await db.user.findUnique({
        where: { id: session.userId },
        select: { name: true },
      });
      await db.document.update({
        where: { id: doc.id },
        data: {
          meta: {
            ...(doc.meta as object),
            quoteWaiver: {
              reason,
              byName: user?.name ?? "",
              at: ymdKst(new Date()),
            },
          },
        },
      });
    }
  }

  const result = await submitDocument(docId, session.userId);
  revalidatePath(`/modules/approvals/${docId}`);
  return result.error ? result : undefined;
}
```

- [ ] **Step 2: 패널에 사유 입력 흐름**

`approval-panel.tsx`:

(a) props에 `waiverNote?: string | null` 추가.

(b) 컴포넌트 상단 state에 추가:

```tsx
  const [needWaiver, setNeedWaiver] = useState(false);
  const [waiverReason, setWaiverReason] = useState("");
```

(c) 상신 버튼 블록(133~156행)을 교체:

```tsx
      {/* 상신 / 재상신 */}
      {canSubmit && (docStatus === "draft" || docStatus === "rejected") && (
        <div className="mt-3 space-y-2 border-t border-[var(--gian-line)] pt-3">
          {rejected && docStatus === "rejected" && (
            <p className="rounded-md bg-[var(--gian-stamp-soft)] p-2 text-xs text-[var(--gian-stamp)]">
              {rejected.label}이(가) 반려했습니다
              {rejected.comment ? ` — "${rejected.comment}"` : ""}. 다시
              상신하면 결재가 처음부터 진행됩니다.
            </p>
          )}
          {/* 증빙 부족 → 사유를 받아 긴급 예외로 상신 (사유는 결재선·인쇄물에 남는다) */}
          {needWaiver && (
            <textarea
              rows={2}
              value={waiverReason}
              onChange={(e) => setWaiverReason(e.target.value)}
              placeholder="견적서 없이 상신하는 사유 (결재자와 인쇄물에 표시됩니다)"
              className="w-full rounded-md border border-[var(--gian-line-strong)] bg-[var(--gian-paper)] px-3 py-2 text-sm"
            />
          )}
          <Button
            size="lg"
            className="w-full"
            disabled={pending || (needWaiver && !waiverReason.trim())}
            onClick={() => {
              setError(undefined);
              startTransition(async () => {
                const r = await submitGian(
                  docId,
                  needWaiver ? waiverReason : undefined,
                );
                if (r?.needWaiver) {
                  setNeedWaiver(true);
                  setError(r.error);
                  return;
                }
                if (r?.error) setError(r.error);
              });
            }}
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            {needWaiver
              ? "사유와 함께 상신"
              : docStatus === "rejected"
                ? "다시 상신"
                : "결재 상신"}
          </Button>
        </div>
      )}
```

(d) 결재선 타임라인(`</ol>` 뒤, 상신 블록 앞)에 waiver 표시:

```tsx
      {waiverNote && (
        <p className="mt-2 rounded-md bg-[var(--gian-stamp-soft)] p-2 text-xs text-[var(--gian-stamp)]">
          {waiverNote}
        </p>
      )}
```

- [ ] **Step 3: 페이지에서 패널로 전달**

`[docId]/page.tsx`의 `<ApprovalPanel …/>`에 prop 추가:

```tsx
              waiverNote={waiverNote}
```

- [ ] **Step 4: 브라우저 검증**

Task 5의 테스트 문서에서 (파일은 한빛방수 1장만 있는 상태로 — 튼튼설비 것은 지워서 부족 상태를 만든다):
1. "결재 상신" 클릭 → 에러 "튼튼설비의 견적서가 첨부되지 않았습니다. …" + 사유 입력칸이 열린다. **상신되지 않았다**(문서 상태 여전히 작성 중).
2. 사유 없이 버튼 비활성 확인.
3. 사유 "긴급 누수로 견적서 수령 전 상신" 입력 → "사유와 함께 상신" → 성공, 결재선 스냅샷이 생기고 패널에 `※ 견적서 미첨부 — 사유: …` 붉은 박스가 보인다.
4. 상신된 문서에서 견적서 첨부 패널의 올리기·삭제 버튼이 사라졌다.
5. (별개) 두 번째 문서를 만들어(`npx tsx gian-attachment.manual.ts` 재실행) 두 업체 모두 파일을 채우고 상신 → 사유 입력 없이 바로 성공.

주의: 상신은 결재선 설정이 있어야 성공한다. "결재선이 비어 있습니다" 에러가 나면 설정 > 결재선에서 test1을 지정하고 다시.

- [ ] **Step 5: 전체 테스트**

Run: `npx tsx gian-attachment.test.ts && npx tsx gian-rules.test.ts && npx tsc --noEmit && npm run lint`
Expected: 전부 통과

- [ ] **Step 6: 커밋**

```bash
git add "src/app/(app)/modules/approvals/approval-actions.ts" "src/app/(app)/modules/approvals/[docId]/approval-panel.tsx" "src/app/(app)/modules/approvals/[docId]/page.tsx"
git commit -m "상신 가드 — 견적서 없으면 막고, 긴급 사유는 문서에 남긴다

수의계약은 비교표의 업체 전부, 입찰은 증빙 1장이 있어야 상신된다.
막기만 하면 아무 파일이나 올려서 뚫는다 — 사유를 받아 통과시키되
그 사유가 결재선 화면에 붉게 남아 결재자가 알고 승인하게 했다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: 인쇄물 ※ 줄 + A4 인쇄 미리보기 확인

**Files:**
- Modify: `src/components/gian-paper.tsx` — `waiver` prop + ※ 줄
- Modify: `src/app/(app)/modules/approvals/[docId]/page.tsx` — `GianPaper`에 전달

**Interfaces:**
- Consumes: Task 5의 `waiverNote` (이미 `※ 견적서 미첨부 — 사유: … (날짜 이름)` 형태로 포맷돼 있다)
- Produces: `GianPaper` props에 `waiver?: string | null`

- [ ] **Step 1: GianPaper에 ※ 줄**

`gian-paper.tsx` — props에 `waiver` 추가:

```tsx
  waiver,
```

```tsx
  waiver?: string | null;
```

붙임 블록(`{/* 붙임 — … */}` 주석이 붙은 `<div className="mt-[8mm]">`) **바로 위**에:

```tsx
      {/* 미첨부 사유는 붙임 위 — 붙임 마지막이 "끝."으로 문서를 닫으므로 그 뒤에 못 적는다 */}
      {waiver && (
        <p className="mt-[8mm] text-[10.5pt] text-[var(--gian-stamp)]">
          {waiver}
        </p>
      )}
```

- [ ] **Step 2: 페이지에서 전달**

`[docId]/page.tsx`의 `<GianPaper …/>`에:

```tsx
                waiver={waiverNote}
```

- [ ] **Step 3: A4 인쇄 미리보기 확인 (스펙 성공 기준 — 눈으로)**

Task 6에서 사유와 함께 상신한 문서와, 사유 없이 상신한 문서 양쪽에서:
1. 화면에서 용지의 붙임 위에 붉은 ※ 줄이 보인다 (사유 있는 쪽만).
2. 인쇄 미리보기(Ctrl+P)를 연다 — claude-in-chrome으로 미리보기 화면 캡처가 안 되면 **사용자에게 확인을 부탁한다**: "두 문서에서 Ctrl+P를 눌러 ① ※ 줄이 A4 안에 들어오는지 ② 사유 한 줄 때문에 페이지가 넘어가지 않는지 봐 달라."
3. 이 확인은 건너뛰지 않는다 — A4 격자는 이전에도 여러 번 손댔고 인쇄를 눈으로 본 적이 없다.

- [ ] **Step 4: 커밋**

```bash
git add src/components/gian-paper.tsx "src/app/(app)/modules/approvals/[docId]/page.tsx"
git commit -m "견적서 미첨부 사유를 인쇄물에도 — 붙임 위 ※ 한 줄

종이만 보는 감사에서는 결재 패널의 사유가 안 보인다.
붙임 마지막이 \"끝.\"으로 문서를 닫으므로 그 뒤가 아니라 위에 적는다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: 폐기 시 용량 회수 + 마무리 검증

**Files:**
- Modify: `src/app/(app)/modules/approvals/approval-actions.ts` — `voidGian`

**Interfaces:**
- Consumes: Task 2의 `data Bytes?`

- [ ] **Step 1: voidGian에 data 비우기**

`voidGian`의 `$transaction` 배열에 한 줄 추가 (approvalStep.updateMany와 document.update 사이):

```ts
    // 폐기 문서의 파일 본문 회수 — 이름·해시(row)는 결재 기록으로 남긴다
    db.documentAttachment.updateMany({
      where: { documentId: docId },
      data: { data: null },
    }),
```

- [ ] **Step 2: 폐기 동작 확인**

새 테스트 문서 생성(`npx tsx gian-attachment.manual.ts`) → 파일 1장 업로드 → 브라우저에서 "문서 폐기" → 확인:
1. 파일명 링크 클릭 → **410** (본문 비워짐).
2. 일회성 조회로 row 잔존 확인:

```ts
// npx tsx check-void.manual.ts (확인 후 삭제)
import { db } from "./src/lib/db";
async function main() {
  const rows = await db.documentAttachment.findMany({
    where: { data: null },
    select: { name: true, sha256: true, size: true },
  });
  console.log(rows); // 이름·해시·크기가 남아 있어야 한다
  if (rows.length === 0) throw new Error("폐기했는데 data=null인 row가 없다");
  console.log("✓ 폐기 후 기록 보존 + 용량 회수");
}
main().then(() => process.exit(0));
```

확인 후 `rm check-void.manual.ts`.

- [ ] **Step 3: 크로스 테넌트 확인 (스펙 성공 기준 5)**

셀프서비스 가입이 열려 있다 — claude-in-chrome으로 `/signup`에서 둘째 단지(예: "검증테스트아파트" / test-cross@test.com / test1234)를 만들고 로그인한 뒤, Task 5 문서의 첨부 URL(`/api/attachments/[실제 id]`)을 직접 연다.
Expected: **404.** (같은 URL이 test1 세션에서는 200/410이었다)

- [ ] **Step 4: 전체 검증**

```bash
npx tsx gian-attachment.test.ts
npx tsx gian-rules.test.ts
npx tsx tenant-deletion.test.ts
npx tsx dates.test.ts
npx tsc --noEmit
npm run lint
```

Expected: 전부 통과.

- [ ] **Step 5: 커밋**

```bash
git add "src/app/(app)/modules/approvals/approval-actions.ts"
git commit -m "폐기 문서의 첨부 본문 회수 — 기록은 남고 용량만 비운다

void는 하드 삭제가 아니라는 기존 원칙 그대로: 이름·해시 row는
결재 기록으로 보존하고 Bytes만 null로 돌려 저장 공간을 되찾는다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```
