import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSubscribed } from "@/lib/modules";
import { Role } from "@/generated/prisma/enums";
import { buildLetter, koDate, type DunningStage } from "@/lib/dunning";
import { docStatusLabels, docStatusStyles } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { PaperScale } from "@/components/paper-scale";
import { PrintStyle } from "@/components/gian-paper";
import { DunningSheets } from "@/components/dunning-paper";
import { EntriesPanel } from "./entries-panel";
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
  const voided = doc.status === "void";
  // 폐기는 작성자 본인 또는 마스터 — 문서 수정·폐기의 공통 경계
  const canVoid =
    doc.createdById === session.userId || session.role === Role.DIRECTOR;

  return (
    <>
      <PrintStyle target="dunning-sheets" margin="18mm 20mm" />
      {/* 기안·공고문과 같은 기둥 — A4 794 + 패널 320, 간격도 같은 gap-6 */}
      <div className="mx-auto max-w-[794px] xl:max-w-[1138px]">
        <Link
          href="/modules/dunning"
          className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground print:hidden"
        >
          <ChevronLeft className="size-4" />
          목록
        </Link>

        {/* 머리줄은 아래 격자와 같은 두 칸 — 인쇄 버튼의 왼쪽 시작선이 오른쪽 목록과 맞는다 */}
        <div className="mb-3.5 grid gap-x-6 gap-y-3 print:hidden xl:grid-cols-[minmax(0,794px)_320px]">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded border-[1.5px] border-[var(--gian-stamp)] py-1 pr-3 pl-3.5 text-sm font-bold tracking-[.18em] text-[var(--gian-stamp)]">
              독촉장
            </span>
            <span className="text-sm text-[var(--gian-ink-soft)]">
              {doc.docNo}
            </span>
            {voided && (
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${docStatusStyles.void}`}
              >
                {docStatusLabels.void}
              </span>
            )}
            <span className="truncate text-sm text-muted-foreground">
              {doc.title}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {!voided && <PrintButton />}
            {!voided && hasProof && (
              <Button asChild variant="outline">
                {/* 내용증명은 우체국 발송이 마지막 걸음 — 인터넷우체국 편지병합에 올릴 수신인 목록 */}
                <a href={`/modules/dunning/${doc.id}/postal`} download>우체국 수신인 목록</a>
              </Button>
            )}
          </div>
        </div>

        {/* 2단은 xl부터 — 그 아래에서는 조치 칸(세대 목록)이 용지 위로 올라간다 */}
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,794px)_320px]">
          <div className="order-2 min-w-0 xl:order-1">
            <PaperScale>
              <DunningSheets
                letters={letters} docNo={doc.docNo ?? ""} sentDate={koDate(meta.sentDate)}
                office={`${tenant.name} 관리사무소`} tel={tenant.phone}
                sealImage={tenant.sealImage} logoImage={tenant.logoImage}
              />
            </PaperScale>
          </div>
          <aside className="order-1 flex flex-col gap-3 print:hidden xl:order-2 xl:sticky xl:top-5">
            {hasProof && (
              <p className="text-xs text-muted-foreground">
                내용증명은 같은 문서 3부를 우체국에 제출합니다. [우체국 수신인 목록]은 인터넷우체국
                편지병합용 기본 열(성명·우편번호·주소)로 내려받습니다. 실제 양식과 열 순서가 다르면
                내려받은 파일을 인터넷우체국 양식에 맞게 조정해 주세요.
              </p>
            )}
            <EntriesPanel
              docId={doc.id}
              voided={voided}
              canVoid={canVoid}
              rows={entries.map((e, i) => ({
                id: e.id, unit: `${e.dong}동 ${e.ho}호`, name: e.name ?? "",
                amount: e.amount, stage: e.stage as DunningStage, paid: !!e.paidAt,
                sheetId: `dunning-sheet-${i}`,
              }))}
            />
          </aside>
        </div>
      </div>
    </>
  );
}
