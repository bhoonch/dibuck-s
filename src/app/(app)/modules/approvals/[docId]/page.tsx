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
import { ApprovalPanel, type PanelStep } from "./approval-panel";
import { PrintButton } from "./print-button";

type Meta = {
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
  if (!meta?.draft) notFound();
  const { draft } = meta;

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
