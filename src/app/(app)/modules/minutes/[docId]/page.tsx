import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireTenantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSubscribed } from "@/lib/modules";
import { docStatusLabels, docStatusStyles } from "@/lib/labels";
import { koreanDateKst, ymdKst } from "@/lib/utils";
import { noticeDueYmd, type MeetingMeta } from "@/lib/minutes";
import type { ExternalApprover } from "@/lib/gian/rules";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { PaperScale } from "@/components/paper-scale";
import { PrintStyle } from "@/components/gian-paper";
import { PrintFitOnePage } from "@/components/print-fit";
import { ConvocationPaper } from "@/components/convocation-paper";
import { PrintButton } from "./print-button";

const MODULE_ID = "minutes";
const TYPE = "minutes";

export default async function MeetingDocPage({
  params,
}: {
  params: Promise<{ docId: string }>;
}) {
  const session = await requireTenantSession();
  const tenantId = session.tenantId!;
  if (!(await isSubscribed(tenantId, MODULE_ID))) redirect("/subscriptions");
  const { docId } = await params;
  const doc = await db.document.findFirst({
    where: { id: docId, tenantId, type: TYPE, moduleId: MODULE_ID },
  });
  if (!doc) notFound();

  const meta = doc.meta as MeetingMeta;

  // 초안 단계(meta.minutes 있음) — 완성·서명·공고 파생은 다음 태스크
  if (meta.minutes) {
    const decisionStyles: Record<string, string> = {
      가결: "bg-green-50 text-green-700",
      부결: "bg-red-50 text-red-700",
      보류: "bg-amber-50 text-amber-700",
      없음: "bg-gray-100 text-gray-600",
    };
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
                  {(a.votesFor !== null || a.votesAgainst !== null) &&
                    ` (찬 ${a.votesFor ?? 0} · 반 ${a.votesAgainst ?? 0})`}
                </span>
              </div>
              {a.discussion.length > 0 ? (
                <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
                  {a.discussion.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
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
          <Button disabled title="다음 업데이트에서 제공됩니다">
            회의록 완성
          </Button>
        </div>
      </div>
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
