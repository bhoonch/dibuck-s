import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, Wrench } from "lucide-react";
import { requireTenantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSubscribed } from "@/lib/modules";
import { Role } from "@/generated/prisma/enums";
import { docStatusLabels, docStatusStyles } from "@/lib/labels";
import { ymdKst } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AttentionCard } from "@/components/attention-card";
import { PaperScale } from "@/components/paper-scale";
import { PrintStyle } from "@/components/gian-paper";
import { InspectionPaper } from "@/components/inspection-paper";
import { CompleteActionButton } from "./complete-action-button";
import { InspectionFiles } from "./inspection-files";
import { PrintButton } from "./print-button";
import { VoidButton } from "./void-button";

export default async function InspectionDocPage({
  params,
}: {
  params: Promise<{ docId: string }>;
}) {
  const session = await requireTenantSession();
  const tenantId = session.tenantId!;
  if (!(await isSubscribed(tenantId, "facilities"))) redirect("/subscriptions");
  const { docId } = await params;
  const doc = await db.document.findFirst({
    where: { id: docId, tenantId, type: "inspection", moduleId: "facilities" },
    include: {
      createdBy: { select: { name: true } },
      attachmentFiles: {
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, size: true },
      },
    },
  });
  if (!doc) notFound();

  const meta = (doc.meta ?? {}) as {
    itemId?: string;
    itemName?: string;
    legalBasis?: string;
    doneAt?: string;
    performedBy?: string;
    result?: string;
    findings?: string;
    actions?: string;
    cost?: number;
    vendor?: string | null;
    kind?: string;
    units?: { name: string; result: string }[];
    barrier?: boolean;
    scope?: string;
    note?: string;
    legal?: boolean;
    sourceDocId?: string;
  };
  const tenant = await db.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { name: true },
  });

  const voided = doc.status === "void";
  /*
   * 디벅 기록은 정부 시스템 보고를 대신하지 않는다 — 여기 적었다고 끝난 줄
   * 알면 사용자가 과태료를 문다. 별도 보고 의무가 있는 항목만 안내한다.
   */
  const GOV_REPORT_HINTS: Record<string, [string, string]> = {
    playground_monthly: [
      "점검 결과는 행정안전부 어린이놀이시설 안전관리시스템(cpf.go.kr)에도 입력해야 합니다.",
      "디벅 기록은 시스템 입력을 대신하지 않습니다.",
    ],
    fire_operation: [
      "자체점검 결과보고서는 점검이 끝난 날부터 15일 이내에 관할 소방서에 제출해야 합니다.",
      "디벅 기록은 소방서 보고를 대신하지 않습니다.",
    ],
    fire_comprehensive: [
      "자체점검 결과보고서는 점검이 끝난 날부터 15일 이내에 관할 소방서에 제출해야 합니다.",
      "디벅 기록은 소방서 보고를 대신하지 않습니다.",
    ],
  };
  const item = meta.itemId
    ? await db.inspectionItem.findUnique({
        where: { id: meta.itemId },
        select: { presetKey: true },
      })
    : null;
  const govHint = item?.presetKey
    ? GOV_REPORT_HINTS[item.presetKey]
    : undefined;
  // 작업지시·조치 — 증빙이 아니라 할 일이다. 일지 대신 안내와 버튼을 보여준다
  const action = meta.kind === "action";
  const workOrder =
    !action && (doc.status === "scheduled" || meta.kind === "workorder");
  const canEdit =
    doc.createdById === session.userId || session.role === Role.DIRECTOR;
  // 지적사항 → 수선 연동 — 수선 모듈 구독 시에만 버튼이 있다(잠금 유도 배너 금지)
  const repairLink =
    !voided && !action && !workOrder && meta.findings?.trim()
      ? (await isSubscribed(tenantId, "repairs"))
        ? `/modules/repairs/new?symptom=${encodeURIComponent(
            `${meta.itemName ?? ""} 점검 지적: ${meta.findings}`
              .trim()
              .slice(0, 200),
          )}&vendor=${encodeURIComponent(meta.vendor ?? "")}`
        : null
      : null;

  if (action)
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <Link
          href="/modules/facilities"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" /> 현황판
        </Link>
        <Card className="p-6">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              doc.status === "scheduled" && meta.legal
                ? "bg-red-50 text-red-700"
                : (docStatusStyles[doc.status] ?? "bg-gray-100 text-gray-600")
            }`}
          >
            {doc.status === "scheduled"
              ? meta.legal
                ? "법정 기한"
                : "조치 예정"
              : (docStatusLabels[doc.status] ?? doc.status)}
          </span>
          <h1 className="mt-2 text-lg font-semibold">{doc.title}</h1>
          {doc.dueDate && (
            <p className="mt-1 font-mono text-sm">기한 {ymdKst(doc.dueDate)}</p>
          )}
          {meta.note && (
            <p className="mt-2 text-sm text-muted-foreground">{meta.note}</p>
          )}
          {meta.sourceDocId && (
            <p className="mt-2 text-sm">
              <Link
                href={`/modules/facilities/${meta.sourceDocId}`}
                className="text-primary underline-offset-2 hover:underline"
              >
                이 조치가 나온 점검일지 보기
              </Link>
            </p>
          )}
          {doc.status === "scheduled" && (
            <>
              <p className="mt-3 text-sm text-muted-foreground">
                조치를 마치면 아래 버튼으로 닫아 주세요 — 다음 달 점검 기록을
                남겨도 이 조치는 자동으로 닫히지 않습니다. 재검사에 합격해
                이용금지를 해제했다면 관할 시·군·구청과 어린이놀이시설
                안전관리시스템에도 결과를 업데이트하세요.
              </p>
              <div className="mt-4">
                <CompleteActionButton docId={doc.id} />
              </div>
            </>
          )}
        </Card>
      </div>
    );

  if (workOrder)
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <Link
          href="/modules/facilities"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4" /> 현황판
        </Link>
        <Card className="p-6">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${docStatusStyles[doc.status] ?? "bg-gray-100 text-gray-600"}`}
          >
            {docStatusLabels[doc.status] ?? doc.status}
          </span>
          <h1 className="mt-2 text-lg font-semibold">{doc.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {doc.dueDate && `점검 예정일 ${ymdKst(doc.dueDate)} — `}
            점검을 마치면 [기록 작성]으로 실시 기록을 남겨 주세요. 기록이
            완성되면 이 작업지시는 자동으로 처리 완료됩니다.
          </p>
          {meta.itemId && doc.status === "scheduled" && (
            <Button asChild className="mt-4">
              <Link href={`/modules/facilities/new?item=${meta.itemId}`}>
                기록 작성
              </Link>
            </Button>
          )}
        </Card>
      </div>
    );

  return (
    <>
      <PrintStyle />
      {/* 문서 화면 공통 기둥 — A4 794 + 패널 320 (교육일지와 동일) */}
      <div className="mx-auto max-w-[794px] xl:max-w-[1138px]">
        <Link
          href="/modules/facilities"
          className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground print:hidden"
        >
          <ChevronLeft className="size-4" />
          목록
        </Link>

        <div className="mb-3.5 grid gap-x-6 gap-y-3 print:hidden xl:grid-cols-[minmax(0,794px)_320px]">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded border-[1.5px] border-[var(--gian-stamp)] py-1 pr-3 pl-3.5 text-sm font-bold tracking-[.18em] text-[var(--gian-stamp)]">
              점검일지
            </span>
            {doc.docNo && (
              <span className="text-sm text-[var(--gian-ink-soft)]">
                {doc.docNo}
              </span>
            )}
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${docStatusStyles[doc.status] ?? "bg-gray-100 text-gray-600"}`}
            >
              {docStatusLabels[doc.status] ?? doc.status}
            </span>
            {!voided && canEdit && (
              <Button asChild variant="outline" className="ml-auto">
                <Link href={`/modules/facilities/${doc.id}/edit`}>
                  내용 수정
                </Link>
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {!voided && <PrintButton />}
          </div>
        </div>

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,794px)_320px]">
          <div className="order-2 min-w-0 xl:order-1">
            <PaperScale>
              <InspectionPaper
                data={{
                  docNo: doc.docNo ?? "-",
                  itemName: meta.itemName ?? doc.title,
                  legalBasis: meta.legalBasis ?? "",
                  doneAt: meta.doneAt ?? ymdKst(doc.createdAt),
                  performedBy: meta.performedBy ?? "자체",
                  result: meta.result ?? "정상",
                  units: meta.units ?? [],
                  barrier: meta.barrier ?? false,
                  scope: meta.scope ?? "",
                  findings: meta.findings ?? "",
                  actions: meta.actions ?? "",
                  cost: meta.cost ?? 0,
                  attachmentNames: doc.attachmentFiles.map((f) => f.name),
                  author: doc.createdBy?.name ?? "",
                  office: `${tenant.name} 관리사무소장`,
                }}
              />
            </PaperScale>
          </div>
          {/* 오른쪽은 이 문서에 대한 판단 자리 — sticky (교육일지와 동일) */}
          <aside className="order-1 flex flex-col gap-3 print:hidden xl:order-2 xl:sticky xl:top-5">
            {repairLink && (
              <Card className="p-4">
                <h4 className="mb-1.5 text-sm font-semibold">
                  지적사항 수선 연결
                </h4>
                <p className="text-sm text-muted-foreground">
                  지적 내용이 증상으로 채워진 수선 기록을 바로 만들 수 있습니다.
                  <br />
                  수선 이력에 쌓여 비용 근거가 됩니다.
                </p>
                <Button asChild variant="outline" size="sm" className="mt-3">
                  <Link href={repairLink}>
                    <Wrench className="size-4" /> 수선 등록
                  </Link>
                </Button>
              </Card>
            )}
            {!voided && govHint && (
              <AttentionCard title="별도 보고 의무가 있습니다">
                {govHint[0]}
                <br />
                {govHint[1]}
              </AttentionCard>
            )}
            {!voided && (
              <InspectionFiles docId={doc.id} files={doc.attachmentFiles} />
            )}
            {voided ? (
              <Card className="p-4 text-sm text-muted-foreground">
                폐기된 기록입니다. 기록으로만 남아 있습니다.
                <br />
                실시일이 잘못됐다면 새 기록을 만들고 [항목 관리]에서 기준일을
                확인하세요.
              </Card>
            ) : (
              <Card className="p-4">
                <h4 className="mb-1.5 text-sm font-semibold">보관 안내</h4>
                <p className="text-sm text-muted-foreground">
                  인쇄해 서명을 받아 서류철에 보관하세요.
                  <br />
                  성적서·검사필증을 첨부해 두면 감사 때 이 화면과 [감사
                  서류철]에서 바로 꺼낼 수 있습니다.
                </p>
                {canEdit && (
                  <div className="mt-3">
                    <VoidButton docId={doc.id} />
                  </div>
                )}
              </Card>
            )}
          </aside>
        </div>
      </div>
    </>
  );
}
