import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSubscribed } from "@/lib/modules";
import { buildLetter, koDate, type DunningStage } from "@/lib/dunning";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { PaperScale } from "@/components/paper-scale";
import { PrintStyle } from "@/components/gian-paper";
import { DunningSheets } from "@/components/dunning-paper";
import { EntriesTable } from "./entries-table";
import { PrintButton } from "./print-button";

export default async function DunningDocPage({
  params,
}: {
  params: Promise<{ docId: string }>;
}) {
  const session = await requireSession();
  const tenantId = session.tenantId!;
  if (!(await isSubscribed(tenantId, "dunning"))) redirect("/subscriptions");
  const { docId } = await params;
  const doc = await db.document.findFirst({
    where: { id: docId, tenantId, type: "dunning_letter" },
  });
  if (!doc) notFound();
  const [entries, tenant] = await Promise.all([
    db.dunningEntry.findMany({
      where: { docId },
      orderBy: [{ dong: "asc" }, { ho: "asc" }],
    }),
    db.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { name: true, address: true, phone: true, sealImage: true, logoImage: true },
    }),
  ]);
  const meta = (doc.meta ?? {}) as { dueDate: string; account: string; sentDate: string };
  const letters = entries.map((e) =>
    buildLetter({
      row: { dong: e.dong, ho: e.ho, name: e.name, amount: e.amount, period: e.period },
      stage: e.stage as DunningStage,
      dueDate: meta.dueDate, account: meta.account,
      office: `${tenant.name} 관리사무소`, address: tenant.address,
    }),
  );
  const hasProof = entries.some((e) => e.stage === 3);

  return (
    <>
      <PrintStyle target="dunning-sheets" margin="18mm 20mm" />
      <PageHeader title={doc.title} description={doc.docNo ?? ""}>
        <PrintButton />
        {hasProof && (
          <Button asChild variant="outline">
            {/* 내용증명은 우체국 발송이 마지막 걸음 — 인터넷우체국 편지병합에 올릴 수신인 목록 */}
            <a href={`/modules/dunning/${doc.id}/postal`} download>우체국 수신인 목록</a>
          </Button>
        )}
      </PageHeader>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <PaperScale>
          <DunningSheets
            letters={letters} docNo={doc.docNo ?? ""} sentDate={koDate(meta.sentDate)}
            office={`${tenant.name} 관리사무소`} tel={tenant.phone}
            sealImage={tenant.sealImage} logoImage={tenant.logoImage}
          />
        </PaperScale>
        <aside className="w-full shrink-0 lg:w-[340px] print:hidden">
          {hasProof && (
            <p className="mb-2 text-xs text-muted-foreground">
              내용증명은 같은 문서 3부를 우체국에 제출합니다. [우체국 수신인 목록]은 인터넷우체국
              편지병합용 기본 열(성명·우편번호·주소)로 내려받습니다. 실제 양식과 열 순서가 다르면
              내려받은 파일을 인터넷우체국 양식에 맞게 조정해 주세요.
            </p>
          )}
          <EntriesTable
            rows={entries.map((e) => ({
              id: e.id, unit: `${e.dong}동 ${e.ho}호`, name: e.name ?? "",
              amount: e.amount, stage: e.stage, paid: !!e.paidAt,
            }))}
          />
        </aside>
      </div>
    </>
  );
}
