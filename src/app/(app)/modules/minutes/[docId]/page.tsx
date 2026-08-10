import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireTenantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSubscribed } from "@/lib/modules";
import { docStatusLabels, docStatusStyles } from "@/lib/labels";
import { dayKst, kstDayStart, koreanDateKst, ymdKst, ymdhmKst } from "@/lib/utils";
import {
  noticeDueYmd,
  quorum,
  toSpeech,
  voteCounts,
  type MeetingMeta,
} from "@/lib/minutes";
import type { ExternalApprover } from "@/lib/gian/rules";
import type { NoticeDoc } from "@/lib/gian/notice";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { PaperScale } from "@/components/paper-scale";
import { PrintStyle } from "@/components/gian-paper";
import { PrintFitOnePage } from "@/components/print-fit";
import { ConvocationPaper } from "@/components/convocation-paper";
import { MinutesPaper } from "@/components/minutes-paper";
import { NoticePaper } from "@/components/notice-paper";
import { PrintButton } from "./print-button";
import { FinalizeForm } from "./finalize-form";
import { VoidButton } from "./void-button";
import { SignPanel, type SignStepRow } from "./sign-panel";
import { NoticeButton } from "./notice-button";

const MODULE_ID = "minutes";
const TYPE = "minutes";

/** 의결 결과 배지 색 — 초안 요약 카드·완성본 의결사항 카드가 공유 */
const decisionStyles: Record<string, string> = {
  가결: "bg-green-50 text-green-700",
  부결: "bg-red-50 text-red-700",
  보류: "bg-amber-50 text-amber-700",
  없음: "bg-gray-100 text-gray-600",
};

export default async function MeetingDocPage({
  params,
  searchParams,
}: {
  params: Promise<{ docId: string }>;
  searchParams: Promise<{ public?: string }>;
}) {
  const session = await requireTenantSession();
  const tenantId = session.tenantId!;
  if (!(await isSubscribed(tenantId, MODULE_ID))) redirect("/subscriptions");
  const { docId } = await params;
  // 공개용 보기(?public=1) — 발언자 성명을 마스킹한 렌더 변형. 문서 데이터는 불변
  const isPublicView = (await searchParams).public === "1";
  // type은 "minutes" 아니면 "notice" — 파생 공고문도 같은 화면에서 연다(원본과 moduleId가 같다)
  const doc = await db.document.findFirst({
    where: { id: docId, tenantId, moduleId: MODULE_ID, type: { in: [TYPE, "notice"] } },
  });
  if (!doc) notFound();

  // 파생 의결 공고문 — gian의 approvals/[docId] meta.notice 분기와 같은 자리
  if (doc.type === "notice") {
    const noticeMeta = doc.meta as { notice?: NoticeDoc; sourceDocId?: string } | null;
    if (!noticeMeta?.notice) notFound(); // createResolutionNotice가 항상 채운다 — 방어적
    const tenant = await db.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { name: true, phone: true, fax: true, sealImage: true, logoImage: true },
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
        <PrintFitOnePage />
        <div className="mx-auto max-w-[794px]">
          <Link
            href="/modules/minutes"
            className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground print:hidden"
          >
            <ChevronLeft className="size-4" />
            목록
          </Link>
          <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3 print:hidden">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded border-[1.5px] border-[var(--gian-stamp)] py-1 pr-3 pl-3.5 text-sm font-bold tracking-[.18em] text-[var(--gian-stamp)]">
                의결사항 공고
              </span>
              <span className="text-sm text-[var(--gian-ink-soft)]">
                {doc.docNo}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <PrintButton label="공고문 인쇄" />
              {noticeMeta.sourceDocId && (
                <Button asChild variant="outline">
                  <Link href={`/modules/minutes/${noticeMeta.sourceDocId}`}>
                    원본 회의록
                  </Link>
                </Button>
              )}
            </div>
          </div>
          <PaperScale>
            <NoticePaper
              notice={noticeMeta.notice}
              docNo={doc.docNo ?? ""}
              office={`${tenant.name} 관리사무소`}
              tel={tel}
              sealImage={tenant.sealImage}
              logoImage={tenant.logoImage}
            />
          </PaperScale>
        </div>
      </>
    );
  }

  const meta = doc.meta as MeetingMeta;

  // 초안 단계(meta.minutes 있음, 아직 draft) — 확인 후 완성하면 아래 분기로 넘어간다
  if (meta.minutes && doc.status === "draft") {
    return (
      <div className="mx-auto max-w-[794px]">
        <Link
          href="/modules/minutes"
          className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          목록
        </Link>
        <PageHeader
          title={doc.title}
          description="회의록 초안입니다. 내용을 확인하고 완성하세요."
        />
        <Card className="space-y-4 p-6">
          {meta.minutes.map((a) => (
            <div
              key={a.order}
              className="space-y-1.5 border-b border-[var(--gian-line)] pb-4 last:border-0 last:pb-0"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold">
                  {a.order}. {a.title}
                </p>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${decisionStyles[a.decision] ?? "bg-gray-100 text-gray-600"}`}
                >
                  {a.decision}
                  {a.decision !== "없음" &&
                    (() => {
                      const c = voteCounts(a);
                      return ` (찬 ${c.for} · 반 ${c.against} · 기권 ${c.abstain})`;
                    })()}
                </span>
              </div>
              {a.discussion.length > 0 ? (
                <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
                  {a.discussion.map((l, i) => {
                    const sp = toSpeech(l);
                    return (
                      <li key={i}>
                        {sp.speaker && (
                          <span className="font-medium text-foreground">
                            {sp.speaker}:{" "}
                          </span>
                        )}
                        {sp.text}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  논의 요지가 비어 있습니다.
                </p>
              )}
            </div>
          ))}
        </Card>
        <div className="mt-4 flex justify-end gap-2">
          <Button asChild variant="outline">
            <Link href={`/modules/minutes/${doc.id}/edit`}>수정</Link>
          </Button>
          <VoidButton docId={doc.id} draft />
        </div>
        <div className="mt-4">
          <FinalizeForm docId={doc.id} agendas={meta.minutes} />
        </div>
      </div>
    );
  }

  // 완성(final) 또는 폐기(void) — 문서번호가 붙은 회의록 A4 + 의결사항
  if (meta.minutes && doc.status !== "draft") {
    const voided = doc.status === "void";
    const resolutions = await db.resolution.findMany({
      where: { meetingDocId: doc.id, tenantId },
      orderBy: { order: "asc" },
    });
    const signSteps = await db.approvalStep.findMany({
      where: { documentId: doc.id },
      orderBy: { order: "asc" },
    });
    // 단지명은 준칙 서식 1면의 "○○○○아파트 입주자대표회의" 자리에 들어간다
    const tenant = await db.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { name: true },
    });
    // 서명 스텝은 참석자 배열의 present 순서와 order(1부터)로 짝짓는다(requestSignatures와 동일 규칙)
    const now = new Date();
    const signRows: SignStepRow[] = meta.attendees
      .filter((a) => a.present)
      .map((a, i) => {
        const step = signSteps.find((s) => s.order === i + 1);
        return {
          order: i + 1,
          label: a.label,
          name: a.name,
          stepId: step?.id ?? null,
          status: step?.status ?? null,
          actedAt: step?.actedAt ? ymdhmKst(step.actedAt) : null,
          token: step?.token ?? null,
          tokenExpired: step ? !step.tokenExpiresAt || step.tokenExpiresAt <= now : false,
        };
      });
    const [ymd, hm] = meta.meetingAt.split(" ");
    // 준칙 서식의 회의일시는 "20○○년 ○○월 ○○일(○). ○○:○○~○○:○○" 꼴이다 —
    // 요일과 폐회 시각까지 넣는다(폐회 시각은 안 적었으면 개회 시각만 나온다).
    const weekday = "일월화수목금토"[dayKst(kstDayStart(ymd))];
    const meetingAtDisplay = `${koreanDateKst(kstDayStart(ymd))}(${weekday}) ${hm}${
      meta.closedAt ? ` ~ ${meta.closedAt}` : ""
    }`;
    const q = quorum(meta.boardSeats, meta.attendees.length, signRows.length);

    return (
      <>
        <PrintStyle />
        {/* 준칙 [별첨 3]이 정한 3면 구성이라 한 장으로 눌러 담지 않는다 —
            PrintFitOnePage를 쓰면 세 면이 한 장에 겹쳐 서식이 무너진다 */}
        <div className="mx-auto max-w-[794px] xl:max-w-[1138px]">
          <Link
            href="/modules/minutes"
            className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground print:hidden"
          >
            <ChevronLeft className="size-4" />
            목록
          </Link>

          <div className="mb-3.5 grid gap-x-6 gap-y-3 print:hidden xl:grid-cols-[minmax(0,794px)_320px]">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-[var(--gian-ink-soft)]">
                {doc.docNo}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${docStatusStyles[doc.status] ?? "bg-gray-100 text-gray-600"}`}
              >
                {docStatusLabels[doc.status] ?? doc.status}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {!voided && (
                <>
                  <Button asChild variant="outline">
                    <Link
                      href={
                        isPublicView
                          ? `/modules/minutes/${doc.id}`
                          : `/modules/minutes/${doc.id}?public=1`
                      }
                    >
                      {isPublicView ? "원본 보기" : "공개용 보기"}
                    </Link>
                  </Button>
                  <PrintButton
                    label={isPublicView ? "공개용 인쇄" : "회의록 인쇄"}
                  />
                </>
              )}
            </div>
          </div>

          {isPublicView && (
            <div className="mb-3.5 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 print:hidden">
              공개용입니다. 문서의 개인 성명을 모두 가렸습니다.
              <br />
              발언 내용 안에 개인정보(호수·전화번호 등)가 남아 있는지 확인한 뒤
              게시하세요.
            </div>
          )}

          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,794px)_320px]">
            <div className="order-2 min-w-0 xl:order-1">
              <PaperScale>
                <MinutesPaper
                  docNo={doc.docNo ?? ""}
                  meetingNo={meta.meetingNo}
                  meetingAt={meetingAtDisplay}
                  kind={meta.kind}
                  place={meta.place}
                  attendees={meta.attendees}
                  agendas={meta.minutes}
                  quorum={q}
                  writerName={meta.writerName}
                  observers={meta.observers}
                  issuedDate={koreanDateKst(kstDayStart(ymd))}
                  tenantName={tenant.name}
                  masked={isPublicView}
                  steps={signSteps.map((s) => ({
                    order: s.order,
                    status: s.status,
                    actedAt: s.actedAt,
                    name: s.name,
                  }))}
                />
              </PaperScale>
            </div>
            <aside className="order-1 flex flex-col gap-3 print:hidden xl:order-2 xl:sticky xl:top-5">
              <Card className="p-4">
                <h4 className="mb-1.5 text-sm font-semibold">의결사항</h4>
                {resolutions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    등록된 의결사항이 없습니다.
                  </p>
                ) : (
                  <ul className="space-y-2.5">
                    {resolutions.map((r) => (
                      <li
                        key={r.id}
                        className="border-b border-[var(--gian-line)] pb-2.5 text-sm last:border-0 last:pb-0"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium">
                            {r.order}. {r.title}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${decisionStyles[r.decision] ?? "bg-gray-100 text-gray-600"}`}
                          >
                            {r.decision}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          후속 조치 {r.followupStatus}
                          {r.dueDate && ` · 기한 ${ymdKst(r.dueDate)}`}
                        </p>
                        {r.note && (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {r.note}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              {!voided && (
                <SignPanel
                  docId={doc.id}
                  rows={signRows}
                  requested={signSteps.length > 0}
                />
              )}
              {!voided && (
                <Card className="space-y-2 p-4">
                  {meta.noticeDocId ? (
                    <Button asChild variant="outline" className="w-full">
                      <Link href={`/modules/minutes/${meta.noticeDocId}`}>
                        공고문 보기
                      </Link>
                    </Button>
                  ) : (
                    <NoticeButton docId={doc.id} />
                  )}
                </Card>
              )}
              <Card className="p-4">
                <h4 className="mb-1.5 text-sm font-semibold">보관 안내</h4>
                <p className="text-sm text-muted-foreground">
                  {voided
                    ? "폐기된 회의록입니다. 기록으로만 남아 있습니다."
                    : "인쇄해 참석자 자필 서명을 받아 보관하세요."}
                </p>
                {!voided && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    관리규약이 정한 기한 안에 관리주체에 회의록을 통보하세요.
                    <br />
                    300세대 이상 단지는 회의록을 14일 이상 동별 게시판과
                    통합정보마당에 공개해야 합니다.
                    <br />
                    게시할 때는 [공개용 보기]로 인쇄하세요.
                  </p>
                )}
                {!voided && (
                  <div className="mt-3">
                    <VoidButton docId={doc.id} draft={false} />
                  </div>
                )}
              </Card>
            </aside>
          </div>
        </div>
      </>
    );
  }

  const tenant = await db.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { name: true, externalApprovers: true },
  });
  const externalApprovers = (tenant.externalApprovers ?? []) as ExternalApprover[];
  const chair = externalApprovers.find((e) => e.role === "CHAIR" && e.name?.trim());
  const signerName = chair ? `입주자대표회의 회장 ${chair.name}` : "관리사무소장";

  const [ymd, hm] = meta.meetingAt.split(" ");
  const [y, m, d] = ymd.split("-");
  const meetingAtDisplay = `${y}년 ${Number(m)}월 ${Number(d)}일 ${hm}`;

  const dueYmd = noticeDueYmd(meta.meetingAt, meta.noticeDays);
  const overdue = dueYmd < ymdKst(new Date());

  return (
    <>
      <PrintStyle margin="0" />
      <PrintFitOnePage />
      <div className="mx-auto max-w-[794px] xl:max-w-[1138px]">
        <Link
          href="/modules/minutes"
          className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground print:hidden"
        >
          <ChevronLeft className="size-4" />
          목록
        </Link>

        <div className="mb-3.5 grid gap-x-6 gap-y-3 print:hidden xl:grid-cols-[minmax(0,794px)_320px]">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded border-[1.5px] border-[var(--gian-stamp)] py-1 pr-3 pl-3.5 text-sm font-bold tracking-[.18em] text-[var(--gian-stamp)]">
              소집 통지
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${docStatusStyles[doc.status] ?? "bg-gray-100 text-gray-600"}`}
            >
              {docStatusLabels[doc.status] ?? doc.status}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <PrintButton />
          </div>
        </div>

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,794px)_320px]">
          <div className="order-2 min-w-0 xl:order-1">
            <PaperScale>
              <ConvocationPaper
                meetingNo={meta.meetingNo}
                meetingAt={meetingAtDisplay}
                place={meta.place}
                agenda={meta.agenda.map((a) => a.title)}
                signerName={signerName}
                docNo={doc.docNo ?? "완성 시 부여"}
                issuedDate={koreanDateKst(new Date())}
              />
            </PaperScale>
          </div>
          <aside className="order-1 flex flex-col gap-3 print:hidden xl:order-2 xl:sticky xl:top-5">
            <Card className="p-4">
              <h4 className="mb-1.5 text-sm font-semibold">통지·게시 방법</h4>
              {/* 준칙(서울 제36조·경기 제25조)의 이원 구조 — 개별 통지가 본체, 게시는 관리주체 공개 의무 */}
              <ol className="space-y-2 text-sm text-muted-foreground">
                <li>
                  ① 동별 대표자에게 개별 통지
                  <br />
                  서면으로 전달하거나, 수신확인이 되는 전자우편으로 보내세요.
                </li>
                <li>
                  ② 게시판 공개
                  <br />
                  이 통지문을 인쇄해 동별 게시판에 붙이고,
                  인터넷 홈페이지(공동주택 통합정보마당)에도 올리세요.
                </li>
              </ol>
              <p className="mt-2 text-xs text-muted-foreground">
                관리규약이 정한 통지 방법을 확인하세요.
              </p>
            </Card>
            <Card className="p-4">
              <h4 className="mb-1.5 text-sm font-semibold">소집 통지 시한</h4>
              <p className="text-sm text-muted-foreground">
                {dueYmd}까지 통지해야 합니다.
              </p>
              {overdue && (
                <p className="mt-2 text-sm font-semibold text-red-600">
                  통지 시한이 지났습니다.
                  <br />
                  관리규약을 확인하세요.
                </p>
              )}
            </Card>
            <Card className="p-4">
              <h4 className="mb-1.5 text-sm font-semibold">회의가 끝났다면</h4>
              <p className="mb-3 text-sm text-muted-foreground">
                통지문을 인쇄해 게시하거나 발송한 뒤, 회의가 끝나면 회의록을
                작성하세요.
              </p>
              <Button asChild className="w-full">
                <Link href={`/modules/minutes/${doc.id}/edit`}>
                  회의 마침, 회의록 쓰기
                </Link>
              </Button>
            </Card>
          </aside>
        </div>
      </div>
    </>
  );
}
