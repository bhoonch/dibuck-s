import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSubscribed } from "@/lib/modules";
import { docStatusLabels, docStatusStyles } from "@/lib/labels";
import type { GianDraft } from "@/lib/gian/claude";
import {
  externalRoleLabels,
  type Classification,
  type ExternalRole,
} from "@/lib/gian/rules";
import { Role } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { panel, panelItem, panelTitle } from "@/components/gian-ui";
import { GianPaper, PrintStyle, type PaperStep } from "@/components/gian-paper";
import { GianSteps } from "@/components/gian-steps";
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
  cls?: Classification;
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

  const docType = meta.cls?.docType;
  const docTypeLabel =
    docType === "gian"
      ? "기 안 서"
      : docType === "ltp_work"
        ? "공사 추진 기안서"
        : "품 의 서";
  const tenant = await db.tenant.findUniqueOrThrow({
    where: { id: doc.tenantId },
    select: { name: true },
  });

  return (
    <>
      <PrintStyle />
      <GianSteps current={doc.status === "draft" ? 2 : 3} />

      {/* ── 결과 머리: 문서 유형 인장 + 액션 (목업 .result-head) ── */}
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded border-[1.5px] border-[var(--gian-stamp)] py-1 pr-3 pl-3.5 text-sm font-bold tracking-[.18em] text-[var(--gian-stamp)]">
            {docTypeLabel}
          </span>
          <span className="font-mono text-sm text-[var(--gian-ink-soft)]">
            {doc.docNo}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${docStatusStyles[doc.status] ?? "bg-gray-100 text-gray-600"}`}
          >
            {docStatusLabels[doc.status] ?? doc.status}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <PrintButton />
          {doc.status === "draft" && (
            <Button asChild variant="outline">
              <Link href={`/modules/approvals/${doc.id}/edit`}>내용 수정</Link>
            </Button>
          )}
          <Button asChild variant="outline">
            <Link href="/modules/approvals/new">다시 만들기</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/modules/approvals">목록</Link>
          </Button>
        </div>
      </div>

      {/* ── 문서 + 검토 패널 (목업 .result-grid: 1fr / 320px) ── */}
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col items-center">
          <GianPaper
            draft={draft}
            steps={paperSteps}
            docNo={doc.docNo}
            office={`${tenant.name} 관리사무소`}
            docType={docType}
            createdAt={doc.createdAt}
          />

          {/* 이어서 만들기 (목업 .followup) — 결재가 끝난 문서에서만 */}
          {doc.status === "final" && (
            <div className="mt-4 w-full max-w-[210mm] rounded-lg border border-[var(--gian-line)] bg-[var(--gian-card)] px-4 py-4 print:hidden">
              <h4 className="text-sm font-bold">이어서 만들기</h4>
              <p className="mt-1 mb-3 text-xs text-[var(--gian-ink-soft)]">
                이 문서의 입력을 그대로 재사용합니다 — 다시 입력할 필요 없어요.
              </p>
              {notice ? (
                <Button asChild>
                  <Link href={`/modules/approvals/${notice.id}`}>
                    입주민 공고문 {notice.docNo}
                  </Link>
                </Button>
              ) : (
                // 자동 파생이 실패했을 때의 복구 경로
                <form action={makeGianNotice}>
                  <input type="hidden" name="docId" value={doc.id} />
                  <Button type="submit">입주민 공고문 만들기</Button>
                </form>
              )}
            </div>
          )}
        </div>

        {/* ── 검토·결재 패널 (화면 전용, 목업 .side) ── */}
        <aside className="flex flex-col gap-3.5 lg:sticky lg:top-5 print:hidden">
          <ApprovalPanel
            docId={doc.id}
            docStatus={doc.status}
            canSubmit={canSubmit}
            steps={panelSteps}
          />

          {draft.attachments.length > 0 && (
            <div className={panel}>
              <h4 className={panelTitle}>첨부 체크리스트</h4>
              <ul>
                {draft.attachments.map((a, i) => (
                  <li key={i} className={panelItem}>
                    <span className="shrink-0 font-bold text-[var(--gian-ok)]">
                      ✓
                    </span>
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {draft.legalNotices.length > 0 && (
            <div
              className={`${panel} border-l-[3px] border-l-[var(--gian-stamp)]`}
            >
              <h4 className={`${panelTitle} text-[var(--gian-stamp)]`}>
                법적 유의사항
              </h4>
              <ul>
                {draft.legalNotices.map((n, i) => (
                  <li key={i} className={panelItem}>
                    <span className="shrink-0 font-bold text-[var(--gian-stamp)]">
                      !
                    </span>
                    {n}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {draft.needsClarification.length > 0 && doc.status === "draft" && (
            <div className={panel}>
              <h4 className={panelTitle}>확인이 필요해요</h4>
              <ul>
                {draft.needsClarification.map((c, i) => (
                  <li key={i} className={panelItem}>
                    <span className="shrink-0 font-bold text-[var(--gian-warn)]">
                      ?
                    </span>
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
