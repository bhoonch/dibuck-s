import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";

/** 내용증명(3차) 세대의 수신인 목록 — 인터넷우체국 편지병합(대량 전자내용증명)용 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ docId: string }> },
) {
  const session = await requireSession();
  const { docId } = await params;
  const doc = await db.document.findFirst({
    where: { id: docId, tenantId: session.tenantId!, type: "dunning_letter" },
    select: { docNo: true },
  });
  if (!doc) return new NextResponse("Not Found", { status: 404 });
  const [tenant, entries] = await Promise.all([
    db.tenant.findUniqueOrThrow({
      where: { id: session.tenantId! },
      select: { address: true },
    }),
    db.dunningEntry.findMany({
      where: { docId, stage: 3 },
      orderBy: [{ dong: "asc" }, { ho: "asc" }],
    }),
  ]);
  if (entries.length === 0)
    return new NextResponse("내용증명 대상 세대가 없습니다.", { status: 404 });

  const XLSX = await import("xlsx");
  const ws = XLSX.utils.aoa_to_sheet([
    ["성명", "우편번호", "주소"],
    ...entries.map((e) => [
      e.name ?? "입주자",
      "", // 우편번호는 단지가 하나뿐 — 사용자가 한 번 채워 넣는다
      [tenant.address, `${e.dong}동 ${e.ho}호`].filter(Boolean).join(" "),
    ]),
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "수신인");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return new NextResponse(buf, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="postal.xlsx"; filename*=UTF-8''${encodeURIComponent(`우체국수신인-${doc.docNo ?? docId}.xlsx`)}`,
    },
  });
}
