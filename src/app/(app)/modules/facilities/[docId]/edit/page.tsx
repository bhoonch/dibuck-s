import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireTenantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSubscribed } from "@/lib/modules";
import { Role } from "@/generated/prisma/enums";
import { ymdKst } from "@/lib/utils";
import {
  isPlayground,
  resultChoicesOf,
  PLAYGROUND_SCOPE,
} from "@/lib/inspection/catalog";
import { PageHeader } from "@/components/ui/page-header";
import { RecordForm } from "../../new/record-form";

export default async function EditInspectionRecordPage({
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
      attachmentFiles: { orderBy: { createdAt: "asc" }, select: { name: true } },
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
    kind?: string;
    units?: { name: string; result: string }[];
    barrier?: boolean;
    scope?: string;
  };
  // 폐기본·작업지시는 수정 화면이 없다 — 수정 경계는 액션이 다시 검사한다
  if (doc.status === "void" || doc.status === "scheduled" || meta.kind === "workorder")
    redirect(`/modules/facilities/${doc.id}`);
  if (doc.createdById !== session.userId && session.role !== Role.DIRECTOR)
    redirect(`/modules/facilities/${doc.id}`);

  const [tenant, item] = await Promise.all([
    db.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { name: true } }),
    // 판정어는 항목이 정한다(놀이시설만 4단계) — 기록 스냅샷에는 없으므로 항목에서 읽는다
    meta.itemId
      ? db.inspectionItem.findFirst({
          where: { id: meta.itemId, tenantId },
          select: { presetKey: true },
        })
      : null,
  ]);
  const byUnit = isPlayground(item?.presetKey);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link
        href={`/modules/facilities/${doc.id}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> 일지로
      </Link>
      <PageHeader
        title="점검 기록 수정"
        description="실시일을 고치면 다음 도래일도 다시 계산됩니다. 항목을 잘못 골랐다면 이 기록을 폐기하고 새로 작성해 주세요."
      />
      <RecordForm
        items={[
          {
            id: meta.itemId ?? "",
            name: meta.itemName ?? doc.title,
            legalBasis: meta.legalBasis ?? "",
            vendor: "",
            lastDoneAt: "",
            cycle: "",
            status: "ok",
            left: null,
            resultChoices: resultChoicesOf(item?.presetKey),
            units: byUnit ? (meta.units ?? []).map((u) => u.name) : null,
            scope: meta.scope ?? (byUnit ? PLAYGROUND_SCOPE : ""),
          },
        ]}
        today={ymdKst(new Date())}
        office={`${tenant.name} 관리사무소장`}
        author={doc.createdBy?.name ?? session.name}
        edit={{
          docId: doc.id,
          docNo: doc.docNo ?? "",
          doneAt: meta.doneAt ?? ymdKst(doc.createdAt),
          performedBy: meta.performedBy ?? "자체",
          result: meta.result ?? "정상",
          units: meta.units ?? [],
          barrier: meta.barrier ?? false,
          findings: meta.findings ?? "",
          actions: meta.actions ?? "",
          cost: meta.cost ?? 0,
          attachmentNames: doc.attachmentFiles.map((f) => f.name),
        }}
      />
    </div>
  );
}
