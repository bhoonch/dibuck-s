import { db } from "@/lib/db";
import { tokenState } from "@/lib/gian/approval";
import type { GianDraft } from "@/lib/gian/claude";
import {
  externalRoleLabels,
  type DocType,
  type ExternalRole,
} from "@/lib/gian/rules";
import { GianPaper, type PaperStep } from "@/components/gian-paper";
import { waiverNoteOf, type QuoteWaiver } from "@/lib/gian/attachments";
import type { ContractContext } from "@/lib/gian/rules";
import { SignForm } from "./sign-form";

/**
 * 외부 결재자 서명 페이지 — 로그인 없음, 토큰이 곧 권한.
 * 회장·감사가 카톡·메일로 받은 링크를 모바일로 열어 승인/반려한다.
 */
export default async function ApproveByTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const step = await db.approvalStep.findUnique({
    where: { token },
    include: { document: { include: { approvalSteps: { orderBy: { order: "asc" } } } } },
  });
  const state = tokenState(step, step?.document.status);

  const shell = (children: React.ReactNode) => (
    <main className="mx-auto min-h-screen max-w-3xl space-y-4 p-4">
      <p className="text-lg font-bold tracking-tight text-primary">디벅</p>
      {children}
    </main>
  );

  if (state !== "valid" && state !== "done")
    return shell(
      <div className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
        {state === "expired"
          ? "링크 유효기간(7일)이 지났습니다. 관리사무소에 재발급을 요청해 주세요."
          : "유효하지 않은 링크입니다. 관리사무소에 문의해 주세요."}
      </div>,
    );

  const doc = step!.document;
  const meta = doc.meta as {
    draft: GianDraft;
    cls?: { docType: DocType; context: ContractContext };
    quotes?: { vendor: string }[];
    quoteWaiver?: QuoteWaiver;
  } | null;
  if (!meta?.draft)
    return shell(
      <div className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
        문서를 표시할 수 없습니다. 관리사무소에 문의해 주세요.
      </div>,
    );

  // 명의는 지금의 단지명을 읽는다 (문서 화면과 같은 규칙)
  const tenant = await db.tenant.findUnique({
    where: { id: doc.tenantId },
    select: { name: true },
  });

  /*
   * 견적서 미첨부 사유는 외부 결재자(회장·감사)에게 특히 중요하다 —
   * 증빙 없이 승인 서명을 하는 당사자가 그 사실을 모르면 안 된다.
   * 파일 본문(data)은 select하지 않는다: 판정에 필요한 건 어느 업체에 붙었는지뿐.
   */
  const attachmentFiles = await db.documentAttachment.findMany({
    where: { documentId: doc.id },
    select: { quoteIndex: true },
  });
  const waiverNote = meta.cls
    ? waiverNoteOf(
        meta.cls.context,
        meta.quotes ?? [],
        attachmentFiles,
        meta.quoteWaiver,
      )
    : null;

  const paperSteps: PaperStep[] = doc.approvalSteps.map((s) => ({
    order: s.order,
    label: s.externalRole
      ? externalRoleLabels[s.externalRole as ExternalRole]
      : s.name,
    status: s.status,
    name: s.name,
    actedAt: s.actedAt,
  }));

  return shell(
    <>
      <p className="text-sm text-muted-foreground">
        {doc.docNo} · {step!.name}(
        {step!.externalRole
          ? externalRoleLabels[step!.externalRole as ExternalRole]
          : "결재자"}
        ) 결재 요청
      </p>
      {/* 증빙 없이 올라온 문서 — 서명 버튼보다 위에 둔다 */}
      {waiverNote && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {waiverNote}
        </div>
      )}
      {state === "done" ? (
        <div className="rounded-lg border bg-card p-4 text-center text-sm font-medium">
          이미 처리된 결재입니다.
        </div>
      ) : (
        <SignForm token={token} signerName={step!.name} />
      )}
      <div className="overflow-x-auto">
        <GianPaper
          draft={meta.draft}
          steps={paperSteps}
          docNo={doc.docNo}
          office={`${tenant?.name ?? ""} 관리사무소`}
          docType={meta.cls?.docType}
          createdAt={doc.createdAt}
          waiver={waiverNote}
          id="sign-sheet"
        />
      </div>
    </>,
  );
}
