import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlertTriangle, Info } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSubscribed } from "@/lib/modules";
import { docStatusLabels, docStatusStyles } from "@/lib/labels";
import type { GianDraft } from "@/lib/gian/claude";
import { externalRoleLabels, type ExternalRole } from "@/lib/gian/rules";
import { Role } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { GianPaper, PrintStyle, type PaperStep } from "@/components/gian-paper";
import { NoticePaper } from "@/components/notice-paper";
import { findNoticeFor, type NoticeDoc } from "@/lib/gian/notice";
import { makeGianNotice } from "../approval-actions";
import { ApprovalPanel, type PanelStep } from "./approval-panel";
import { PrintButton } from "./print-button";

type Meta = {
  /** 파생 공고문이면 이쪽만 있다 */
  notice?: NoticeDoc;
  sourceDocId?: string;
  draft: GianDraft;
  plannedSteps: {
    order: number;
    userId?: string;
    externalRole?: ExternalRole;
    name: string;
  }[];
};

export default async function GianDocumentPage({
  params,
}: {
  params: Promise<{ docId: string }>;
}) {
  const session = await requireSession();
  if (!(await isSubscribed(session.tenantId!, "approvals")))
    redirect("/settings/subscriptions");

  const doc = await db.document.findUnique({
    where: { id: (await params).docId },
    include: { approvalSteps: { orderBy: { order: "asc" } } },
  });
  // 테넌트 경계 — 다른 단지 문서 id를 넣어도 404
  if (!doc || doc.tenantId !== session.tenantId || doc.moduleId !== "approvals")
    notFound();
  const meta = doc.meta as Meta | null;

  // ── 결재 완료에서 파생된 입주민 공고문 ──
  // 명의·연락처·직인은 스냅샷이 아니라 지금의 단지 정보를 읽는다
  if (meta?.notice) {
    const tenant = await db.tenant.findUniqueOrThrow({
      where: { id: doc.tenantId },
      select: { name: true, phone: true, fax: true, sealImage: true },
    });
    const tel = [
      tenant.phone && `TEL : ${tenant.phone}`,
      tenant.fax && `FAX : ${tenant.fax}`,
    ]
      .filter(Boolean)
      .join(" / ");
    return (
      <>
        <PrintStyle margin="0" />
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{doc.docNo}</h1>
            <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
              입주민 공고문
            </span>
          </div>
          <div className="flex gap-2">
            <PrintButton />
            {meta.sourceDocId && (
              <Button asChild variant="outline">
                <Link href={`/modules/approvals/${meta.sourceDocId}`}>
                  원본 결재 문서
                </Link>
              </Button>
            )}
            <Button asChild variant="ghost">
              <Link href="/modules/approvals">목록</Link>
            </Button>
          </div>
        </div>
        <NoticePaper
          notice={meta.notice}
          docNo={doc.docNo ?? ""}
          office={`${tenant.name} 관리사무소`}
          tel={tel}
          sealImage={tenant.sealImage}
        />
        {!tenant.phone && (
          <p className="mt-3 text-sm text-muted-foreground print:hidden">
            설정 &gt; 단지 정보에 대표번호를 등록하면 공고문 하단에 연락처가
            표시됩니다.
          </p>
        )}
      </>
    );
  }

  if (!meta?.draft) notFound();
  const { draft } = meta;
  const notice = doc.status === "final" ? await findNoticeFor(doc.id) : null;

  const roleOrName = (s: { externalRole?: string | null; name: string }) =>
    s.externalRole
      ? externalRoleLabels[s.externalRole as ExternalRole]
      : s.name;

  // 상신 전에는 예정 결재선(스냅샷 예상), 상신 후에는 실제 ApprovalStep이 결재란
  const paperSteps: PaperStep[] =
    doc.approvalSteps.length > 0
      ? doc.approvalSteps.map((s) => ({
          order: s.order,
          label: roleOrName(s),
          status: s.status,
          name: s.name,
          actedAt: s.actedAt,
        }))
      : meta.plannedSteps.map((s) => ({ order: s.order, label: roleOrName(s) }));

  const now = new Date();
  const panelSteps: PanelStep[] = doc.approvalSteps.map((s) => ({
    id: s.id,
    order: s.order,
    label: roleOrName(s),
    status: s.status,
    comment: s.comment,
    isMine: s.userId === session.userId,
    isExternal: !s.userId,
    token: s.token,
    tokenExpired: !s.tokenExpiresAt || s.tokenExpiresAt <= now,
  }));
  const canSubmit =
    doc.createdById === session.userId || session.role === Role.DIRECTOR;

  return (
    <>
      <PrintStyle />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{doc.docNo}</h1>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${docStatusStyles[doc.status] ?? "bg-gray-100 text-gray-600"}`}
          >
            {docStatusLabels[doc.status] ?? doc.status}
          </span>
        </div>
        <div className="flex gap-2">
          <PrintButton />
          {notice ? (
            <Button asChild>
              <Link href={`/modules/approvals/${notice.id}`}>
                입주민 공고문 {notice.docNo}
              </Link>
            </Button>
          ) : (
            doc.status === "final" && (
              // 자동 파생이 실패했을 때의 복구 경로 — 결재 완료 문서에서만 보인다
              <form action={makeGianNotice}>
                <input type="hidden" name="docId" value={doc.id} />
                <Button type="submit">입주민 공고문 만들기</Button>
              </form>
            )
          )}
          <Button asChild variant="outline">
            <Link href="/modules/approvals/new">다시 만들기</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/modules/approvals">목록</Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <GianPaper draft={draft} steps={paperSteps} />

        {/* ── 검토·결재 패널 (화면 전용) ── */}
        <div className="min-w-64 flex-1 space-y-4 print:hidden">
          <ApprovalPanel
            docId={doc.id}
            docStatus={doc.status}
            canSubmit={canSubmit}
            steps={panelSteps}
          />
          {draft.needsClarification.length > 0 && doc.status === "draft" && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <p className="mb-1 flex items-center gap-1.5 font-semibold">
                <AlertTriangle className="size-4" /> 확인이 필요합니다
              </p>
              <ul className="list-disc space-y-1 pl-5">
                {draft.needsClarification.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </div>
          )}
          {draft.legalNotices.length > 0 && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
              <p className="mb-1 flex items-center gap-1.5 font-semibold">
                <Info className="size-4" /> 법적 유의사항
              </p>
              <ul className="list-disc space-y-1 pl-5">
                {draft.legalNotices.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
