import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { ymdKst } from "@/lib/utils";
import { isSubscribed } from "@/lib/modules";
import { docStatusLabels, docStatusStyles } from "@/lib/labels";
import type { GianDraft } from "@/lib/gian/claude";
import {
  buildApprovalSteps,
  externalRoleLabels,
  type Classification,
  type ExternalRole,
} from "@/lib/gian/rules";
import { approvalLineFor } from "@/lib/gian/approval";
import { Role } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { SavedToast } from "@/components/ui/saved-toast";
import { PaperScale } from "@/components/paper-scale";
import { panel, panelItem, panelTitle } from "@/components/gian-ui";
import { GianPaper, PrintStyle, type PaperStep } from "@/components/gian-paper";
import { GianSteps } from "@/components/gian-steps";
import { NoticePaper } from "@/components/notice-paper";
import {
  findNoticeFor,
  isConcreteSchedule,
  vagueScheduleLine,
  splitPlaces,
  DEFAULT_POST_TO,
  NOTICE_PLACES,
  type NoticeDoc,
} from "@/lib/gian/notice";
import {
  attachmentLines,
  quoteFileGap,
  waiverNoteOf,
} from "@/lib/gian/attachments";
import {
  findFollowupFor,
  followupMeta,
  type FollowupKind,
} from "@/lib/gian/followup";
import { makeGianNotice } from "../approval-actions";
import { ApprovalPanel, type PanelStep } from "./approval-panel";
import { QuoteFiles } from "./quote-files";
import { NoticePosting } from "./notice-posting";
import { NoticeSchedule } from "./notice-schedule";
import { PrintButton } from "./print-button";

type Meta = {
  /** 파생 공고문이면 이쪽만 있다 */
  notice?: NoticeDoc;
  sourceDocId?: string;
  /** 완료보고서·지출결의서면 어느 서식인지 — 없으면 원 기안·품의다 */
  kind?: FollowupKind;
  draft: GianDraft;
  quotes?: { vendor: string; amount: number }[];
  /** 견적서 없이 상신한 긴급 예외 — 사유는 결재 패널과 인쇄물 양쪽에 남는다 */
  quoteWaiver?: { reason: string; byName: string; at: string };
  cls?: Classification;
  plannedSteps: {
    order: number;
    userId?: string;
    externalRole?: ExternalRole;
    name: string;
  }[];
};

/** 지금 설정 기준의 예정 결재선 — submitDocument와 같은 재료를 쓴다 */
async function plannedStepsNow(
  tenantId: string,
  cls: Classification,
  drafterId?: string | null,
) {
  const { internal, external } = await approvalLineFor(tenantId, drafterId);
  return buildApprovalSteps(cls, internal, external).steps;
}

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
    // 첫 행이 공사·시행일자 — buildNotice가 늘 그 순서로 만든다
    const scheduleRow = meta.notice.rows[0];
    const scheduleLabel = scheduleRow?.k ?? "일자";
    const scheduleVague = !isConcreteSchedule(scheduleRow?.v ?? "");
    const tenant = await db.tenant.findUniqueOrThrow({
      where: { id: doc.tenantId },
      select: {
        name: true,
        phone: true,
        fax: true,
        sealImage: true,
        logoImage: true,
      },
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
        {/* 머리줄과 용지가 같은 왼쪽 시작선을 쓰도록 A4 폭으로 묶어 가운데 (기안 갈래와 같은 규칙) */}
        <div className="mx-auto max-w-[794px]">
          <div className="print:hidden">
            <Link
              href="/modules/approvals"
              className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="size-4" />
              목록
            </Link>
            <PageHeader
              title="입주민 공고문"
              description={doc.docNo ?? undefined}
            >
              <PrintButton
                blocked={
                  scheduleVague
                    ? `${scheduleLabel}를 확정해야 인쇄할 수 있습니다`
                    : undefined
                }
              />
              {meta.sourceDocId && (
                <Button asChild variant="outline">
                  <Link href={`/modules/approvals/${meta.sourceDocId}`}>
                    원본 결재 문서
                  </Link>
                </Button>
              )}
            </PageHeader>
          </div>
          {scheduleVague && (
            <NoticeSchedule
              docId={doc.id}
              current={scheduleRow?.v ?? ""}
              label={scheduleLabel}
            />
          )}
          {/* 어디에 붙이고 언제까지 두는가 — 단지마다 다르고 결재받은 내용도 아니다 */}
          <NoticePosting
            docId={doc.id}
            place={meta.notice.place}
            postTo={meta.notice.postTo}
            options={NOTICE_PLACES}
            defaultPostTo={DEFAULT_POST_TO}
            {...splitPlaces(meta.notice.place)}
          />
          <PaperScale>
            <NoticePaper
              notice={meta.notice}
              docNo={doc.docNo ?? ""}
              office={`${tenant.name} 관리사무소`}
              tel={tel}
              sealImage={tenant.sealImage}
              logoImage={tenant.logoImage}
            />
          </PaperScale>
          {!tenant.phone && (
            <Card className="mt-4 p-4 text-sm text-muted-foreground print:hidden">
              설정 &gt; 단지 정보에 대표번호를 등록하면 공고문 하단에 연락처가
              표시됩니다.
            </Card>
          )}
        </div>
      </>
    );
  }

  if (!meta?.draft) notFound();
  const { draft } = meta;
  const isFollowup = !!meta.kind;
  // 이어서 만들기 후보 — 결재가 끝난 **원** 문서에서만. 파생 문서에서 또 파생하지 않는다
  const [notice, report, expense] =
    doc.status === "final" && !isFollowup
      ? await Promise.all([
          findNoticeFor(doc.id),
          findFollowupFor(doc.id, "report"),
          findFollowupFor(doc.id, "expense"),
        ])
      : [null, null, null];
  // 지출이 없는 문서(점검·행사 안내)에는 완료보고도 지출결의도 붙지 않는다
  const hasSpend = (meta.cls?.amountRaw ?? 0) > 0;

  const roleOrName = (s: { externalRole?: string | null; name: string }) =>
    s.externalRole
      ? externalRoleLabels[s.externalRole as ExternalRole]
      : s.name;

  /**
   * 상신 전 결재란은 **지금 설정**으로 다시 계산한다.
   * meta.plannedSteps는 초안 생성 시점의 스냅샷이라, 그 뒤에 설정 > 결재선에서
   * 회장·감사를 등록해도 화면은 옛 값을 보여줬다 — 상신은 현재 설정으로 하므로
   * 화면과 실제 결재선이 달랐다. 상신 후에는 진짜 스냅샷(ApprovalStep)이 기준.
   */
  const planned = meta.cls
    ? await plannedStepsNow(doc.tenantId, meta.cls, doc.createdById)
    : meta.plannedSteps;

  const paperSteps: PaperStep[] =
    doc.approvalSteps.length > 0
      ? doc.approvalSteps.map((s) => ({
          order: s.order,
          label: roleOrName(s),
          status: s.status,
          name: s.name,
          actedAt: s.actedAt,
        }))
      : planned.map((s) => ({
          order: s.order,
          label: roleOrName(s),
        }));

  const now = new Date();
  const panelSteps: PanelStep[] = doc.approvalSteps.map((s) => ({
    id: s.id,
    order: s.order,
    label: roleOrName(s),
    status: s.status,
    comment: s.comment,
    actedAt: s.actedAt ? ymdKst(s.actedAt) : null,
    isMine: s.userId === session.userId,
    isExternal: !s.userId,
    token: s.token,
    tokenExpired: !s.tokenExpiresAt || s.tokenExpiresAt <= now,
    signature: s.signature as PanelStep["signature"],
  }));
  const canSubmit =
    doc.createdById === session.userId || session.role === Role.DIRECTOR;
  // 반려도 수정 가능하다 — saveGianDraft·edit 페이지가 draft·rejected 둘 다 받는다.
  // 예전엔 화면 버튼만 draft 조건이라 반려당한 사람이 고칠 길이 안 보였다.
  const canEdit = doc.status === "draft" || doc.status === "rejected";
  const vagueLine = vagueScheduleLine(meta.draft.sections);

  // 첨부 파일 — data(Bytes)는 절대 select하지 않는다 (목록 쿼리에 파일이 딸려온다)
  const attachmentFiles = await db.documentAttachment.findMany({
    where: { documentId: doc.id },
    select: { id: true, name: true, size: true, quoteIndex: true },
    orderBy: { createdAt: "asc" },
  });
  const quotes = meta.quotes ?? [];
  // 지금 부족한 증빙 — 패널이 이걸 보고 사유칸을 열고 닫는다(클라이언트에 상태를 남기지 않는다)
  const evidenceGap = meta.cls
    ? quoteFileGap(meta.cls.context, quotes, attachmentFiles)
    : null;
  const waiverNote = meta.cls
    ? waiverNoteOf(meta.cls.context, quotes, attachmentFiles, meta.quoteWaiver)
    : null;

  const docType = meta.cls?.docType;
  const docTypeLabel = meta.kind
    ? followupMeta[meta.kind].docTypeLabel
    : docType === "gian"
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
      <SavedToast message="초안을 저장했습니다." />

      {/*
        기준선은 하나다 — 단계표시·머리줄·용지·패널이 모두 이 기둥 안에서 시작한다.
        기둥 폭 = A4(794) + 패널(288) + 간격. 단계표시와 머리줄을 격자 위로 빼서
        용지와 패널이 같은 높이에서 출발하게 했다(패널에 mt를 주면 머리줄 버튼이
        두 줄로 접히는 순간 어긋난다).
      */}
      <div className="mx-auto max-w-[794px] xl:max-w-[1138px]">
        {/* 목록은 이 문서에 하는 일이 아니라 뒤로 가기다 — 액션 버튼 무리에서 뺀다 */}
        <Link
          href="/modules/approvals"
          className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground print:hidden"
        >
          <ChevronLeft className="size-4" />
          목록
        </Link>

        <GianSteps
          current={canEdit ? 2 : 3}
          editHref={canEdit ? `/modules/approvals/${doc.id}/edit` : undefined}
        />

        {/*
          머리줄도 아래 격자와 같은 두 칸 — 그래야 인쇄 버튼의 왼쪽 시작선이
          결재선 카드의 왼쪽 시작선과 같아진다(간격도 아래 격자와 같은 gap-6).
        */}
        <div className="mb-3.5 grid gap-x-6 gap-y-3 print:hidden xl:grid-cols-[minmax(0,794px)_320px]">
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
            {/* 수정 경로가 사라진 이유를 적는다 — 버튼이 조용히 없어지면 왜인지 알 수 없다 */}
            {!canEdit && (
              <span className="text-sm text-muted-foreground">
                {doc.status === "final"
                  ? "결재가 끝나 내용을 수정할 수 없습니다"
                  : "결재가 시작되어 내용을 수정할 수 없습니다"}
              </span>
            )}
            {/* 용지 우측 끝단과 같은 선 — 인쇄 버튼 줄(오른쪽 칸)과는 다른 칸이다 */}
            {canEdit && (
              <Button
                asChild
                variant="outline"
                className="ml-auto print:hidden"
              >
                <Link href={`/modules/approvals/${doc.id}/edit`}>
                  내용 수정
                </Link>
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <PrintButton />
            {/* 파생 문서에서 "다시 만들기"는 새 기안을 뜻해 오해를 부른다 — 원본으로 보낸다 */}
            {isFollowup && meta.sourceDocId ? (
              <Button asChild variant="outline">
                <Link href={`/modules/approvals/${meta.sourceDocId}`}>
                  원본 품의
                </Link>
              </Button>
            ) : (
              <Button asChild variant="outline">
                <Link href="/modules/approvals/new">다시 만들기</Link>
              </Button>
            )}
          </div>
        </div>

        {/*
          일정이 "○월 ○일"로 남아 있으면 초안일 때 한 번 짚어 준다 — 결재는 막지 않는다.
          공고문 게시 전 일정 확정과 같은 판단이고, 고치는 곳은 초안 수정 화면이다.
        */}
        {canEdit && vagueLine && (
          <div className="mb-4 rounded-lg border border-l-4 border-[var(--gian-warn)]/40 border-l-[var(--gian-warn)] bg-[var(--gian-warn-soft)] p-4 print:hidden">
            <p className="text-sm font-bold text-[var(--gian-warn)]">
              추진일정이 아직 확정되지 않았습니다
            </p>
            <p className="mt-1 text-sm text-[var(--gian-warn)]/90">
              &ldquo;{vagueLine.trim()}&rdquo; — 날짜가 정해졌다면 결재를 올리기
              전에 채워 주세요. 미정인 채로 올려도 결재는 진행됩니다.
            </p>
            <Button asChild variant="outline" className="mt-3">
              <Link href={`/modules/approvals/${doc.id}/edit`}>
                일정 채우기
              </Link>
            </Button>
          </div>
        )}

        {/*
          2단은 xl(1280px)부터 — lg(1024px)에서 2단을 쓰면 문서 칸이 352px밖에
          안 나와 용지 배율이 0.44배로 떨어진다(11.5pt → 5pt). 그 아래에서는
          패널을 문서 위로 올린다.
        */}
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,794px)_320px]">
          <div className="min-w-0">
            <PaperScale>
              <GianPaper
                // 붙임은 실제 첨부파일만이 사실이다 — 렌더 시점 대체라 옛 문서에도 적용된다
                draft={{
                  ...draft,
                  attachments: attachmentLines(quotes, attachmentFiles),
                }}
                steps={paperSteps}
                docNo={doc.docNo}
                office={`${tenant.name} 관리사무소`}
                docType={docType}
                createdAt={doc.createdAt}
                waiver={waiverNote}
                foot={meta.kind ? followupMeta[meta.kind].foot : undefined}
              />
            </PaperScale>

            {/* 이어서 만들기 (목업 .followup) — 결재가 끝난 원 문서에서만 */}
            {doc.status === "final" && !isFollowup && (
              <div className="mt-4 w-full max-w-[210mm] rounded-lg border border-[var(--gian-line)] bg-[var(--gian-card)] px-4 py-4 print:hidden">
                <h4 className="text-sm font-bold">이어서 만들기</h4>
                <p className="mt-1 mb-3 text-xs text-[var(--gian-ink-soft)]">
                  이 문서의 입력을 그대로 재사용합니다 — 다시 입력할 필요
                  없어요.
                </p>
                <div className="flex flex-wrap gap-2">
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
                  {/* 공사가 끝난 뒤·대금을 낼 때 쓰는 문서라 사람이 시작한다(자동 파생 아님) */}
                  {hasSpend &&
                    (["report", "expense"] as const).map((k) => {
                      const made = k === "report" ? report : expense;
                      return (
                        <Button key={k} asChild variant="outline">
                          <Link
                            href={
                              made
                                ? `/modules/approvals/${made.id}`
                                : `/modules/approvals/${doc.id}/followup/${k}`
                            }
                          >
                            {followupMeta[k].label}
                            {made ? ` ${made.docNo}` : " 만들기"}
                          </Link>
                        </Button>
                      );
                    })}
                </div>
              </div>
            )}
          </div>

          {/* ── 검토·결재 패널 (화면 전용, 목업 .side) ── */}
          <aside className="order-first flex flex-col gap-3.5 print:hidden xl:order-none xl:sticky xl:top-5">
            <ApprovalPanel
              docId={doc.id}
              docStatus={doc.status}
              canSubmit={canSubmit}
              steps={panelSteps}
              waiverNote={waiverNote}
              evidenceGap={evidenceGap}
            />

            {/* 예산 없는 기안도 그 밖의 서류(점검표 등)를 올린다 — 붙임은 이 카드가 원천이다 */}
            <QuoteFiles
              docId={doc.id}
              vendors={quotes.map((q) => q.vendor)}
              files={attachmentFiles}
              editable={canEdit}
              suggested={draft.attachments}
            />

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

            {draft.needsClarification.length > 0 && canEdit && (
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
      </div>
    </>
  );
}
