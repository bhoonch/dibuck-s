import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireTenantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSubscribed } from "@/lib/modules";
import { docStatusLabels, docStatusStyles } from "@/lib/labels";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { RepairFiles } from "./repair-files";
import { CompleteButton } from "./complete-button";
import { VoidButton } from "./void-button";
import { LinkEquipment } from "./link-equipment";

type RepairMeta = {
  equipmentId: string | null;
  equipmentName: string | null;
  symptom: string;
  action: string;
  vendor: string;
  cost: number;
  startedAt: string;
  completedAt: string | null;
  imported?: boolean;
};

/** 수선 상태는 open/done — 화면에서는 "조치 중"으로 말한다(결재 어휘와 분리) */
const statusLabel = (s: string) =>
  s === "open" ? "조치 중" : (docStatusLabels[s] ?? s);

export default async function RepairDetailPage({
  params,
}: {
  params: Promise<{ docId: string }>;
}) {
  const session = await requireTenantSession();
  const tenantId = session.tenantId!;
  if (!(await isSubscribed(tenantId, "repairs"))) redirect("/subscriptions");

  const { docId } = await params;
  const doc = await db.document.findFirst({
    where: { id: docId, tenantId, type: "repair", moduleId: "repairs" },
    include: {
      attachmentFiles: { select: { id: true, name: true, size: true } },
    },
  });
  if (!doc) notFound();
  const meta = (doc.meta ?? {}) as RepairMeta;
  const voided = doc.status === "void";

  // [설비에 연결]의 후보 — 미지정 기록에서만 조회
  const equipment =
    !voided && !meta.equipmentId
      ? await db.equipment.findMany({
          where: { tenantId, active: true },
          orderBy: [{ category: "asc" }, { name: "asc" }],
          select: { id: true, name: true },
        })
      : [];

  const rows: [string, string][] = [
    ["설비", meta.equipmentName ?? "미지정 (잡수선)"],
    ["발생일", meta.startedAt ?? "-"],
    ["증상", meta.symptom ?? "-"],
    ["조치", meta.action || "-"],
    ["업체", meta.vendor || "-"],
    ["비용", meta.cost > 0 ? `${meta.cost.toLocaleString("ko-KR")}원` : "-"],
    ["완료일", meta.completedAt ?? "조치 중"],
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link
        href="/modules/repairs"
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        목록
      </Link>
      <PageHeader
        title={doc.title}
        description={doc.docNo ?? "이관 기록 (문서번호 없음)"}
      >
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${docStatusStyles[doc.status] ?? "bg-gray-100 text-gray-600"}`}
        >
          {statusLabel(doc.status)}
        </span>
        {doc.status === "open" && <CompleteButton docId={doc.id} />}
        {!voided && <VoidButton docId={doc.id} />}
      </PageHeader>

      {voided && (
        <Card className="border-destructive/30 bg-destructive/5 p-4 text-sm">
          폐기된 기록입니다. 설비 이력과 비용 집계에서 빠지며 열람만 됩니다.
        </Card>
      )}

      <Card className="p-6">
        <dl className="divide-y">
          {rows.map(([k, v]) => (
            <div key={k} className="flex gap-4 py-2 text-sm">
              <dt className="w-24 shrink-0 text-muted-foreground">{k}</dt>
              <dd className="min-w-0 flex-1 whitespace-pre-wrap">
                {k === "설비" && meta.equipmentId ? (
                  <Link
                    href={`/modules/repairs/equipment/${meta.equipmentId}`}
                    className="font-medium text-blue-700 hover:underline"
                  >
                    {v}
                  </Link>
                ) : (
                  v
                )}
              </dd>
            </div>
          ))}
        </dl>
      </Card>

      <RepairFiles
        docId={doc.id}
        files={doc.attachmentFiles}
        readOnly={voided}
      />

      {!voided && !meta.equipmentId && (
        <LinkEquipment docId={doc.id} equipment={equipment} />
      )}
    </div>
  );
}
