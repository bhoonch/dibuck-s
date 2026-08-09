import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronDown, ChevronLeft } from "lucide-react";
import { requireTenantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSubscribed } from "@/lib/modules";
import { ymdKst } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { EquipmentManager } from "./equipment-manager";
import { EquipmentUpload } from "./equipment-upload";
import { HistoryUpload } from "./history-upload";

export default async function EquipmentPage() {
  const session = await requireTenantSession();
  const tenantId = session.tenantId!;
  if (!(await isSubscribed(tenantId, "repairs"))) redirect("/subscriptions");

  const [items, records] = await Promise.all([
    db.equipment.findMany({
      where: { tenantId },
      orderBy: [{ active: "desc" }, { category: "asc" }, { name: "asc" }],
    }),
    // 설비별 기록 수 — 단지 규모(연 수백 건)라 메모리에서 센다
    db.document.findMany({
      where: { tenantId, type: "repair", status: { not: "void" } },
      select: { meta: true },
    }),
  ]);
  const countByEquip = new Map<string, number>();
  for (const r of records) {
    const id = (r.meta as { equipmentId?: string | null })?.equipmentId;
    if (id) countByEquip.set(id, (countByEquip.get(id) ?? 0) + 1);
  }

  // 대장·이관 업로드는 명부와 같은 경계 — 마스터·매니저
  const canManage =
    session.role === "DIRECTOR" || session.role === "ACCOUNTANT";

  return (
    <div className="space-y-6">
      <Link
        href="/modules/repairs"
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        수선 이력
      </Link>
      <PageHeader
        title="설비 대장"
        description="한 번 등록해 두면 수선 기록이 설비별 이력으로 쌓입니다. 설비가 없어도 수선 기록은 남길 수 있습니다."
      />

      {/* 엑셀 업로드는 대개 처음 한 번뿐이라 접어 둔다. 대장이 비어 있을 때만
          펼쳐 둔다 — 그때는 이게 이 화면에서 할 일 그 자체다. */}
      {canManage && (
        <div className="grid gap-3 sm:grid-cols-2">
          <UploadPanel
            title="설비 목록 엑셀 업로드"
            hint="수기 대장이나 인수인계 파일을 그대로 올리면 됩니다."
            open={items.length === 0}
          >
            <EquipmentUpload />
          </UploadPanel>
          <UploadPanel
            title="과거 수선 이력 가져오기"
            hint="수첩·엑셀에 있던 지난 수선 내역을 들여옵니다."
            open={items.length === 0}
          >
            <HistoryUpload />
          </UploadPanel>
        </div>
      )}

      <EquipmentManager
        items={items.map((it) => ({
          id: it.id,
          name: it.name,
          category: it.category,
          location: it.location ?? "",
          installedAt: it.installedAt ? ymdKst(it.installedAt) : "",
          vendor: it.vendor ?? "",
          note: it.note ?? "",
          active: it.active,
          recordCount: countByEquip.get(it.id) ?? 0,
        }))}
        canManage={canManage}
      />
    </div>
  );
}

function UploadPanel({
  title,
  hint,
  open,
  children,
}: {
  title: string;
  hint: string;
  open: boolean;
  children: React.ReactNode;
}) {
  return (
    <details
      open={open}
      className="group h-fit overflow-hidden rounded-lg border bg-card"
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span>
          <span className="block text-sm font-semibold">{title}</span>
          <span className="block text-sm text-muted-foreground">{hint}</span>
        </span>
        <ChevronDown className="ml-auto size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-gray-100 p-4">{children}</div>
    </details>
  );
}
