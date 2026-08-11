import { NextResponse } from "next/server";
import { logAccess } from "@/lib/access-log";
import { requireTenantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSubscribed } from "@/lib/modules";

/** 내용증명(3차) 세대의 수신인 목록 — 인터넷우체국 편지병합(대량 전자내용증명)용 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ docId: string }> },
) {
  const session = await requireTenantSession();
  if (!(await isSubscribed(session.tenantId!, "dunning")))
    return new NextResponse("Not Found", { status: 404 });
  const { docId } = await params;
  const doc = await db.document.findFirst({
    where: { id: docId, tenantId: session.tenantId!, type: "dunning_letter" },
    select: { docNo: true },
  });
  if (!doc) return new NextResponse("Not Found", { status: 404 });
  const [tenant, entries] = await Promise.all([
    db.tenant.findUniqueOrThrow({
      where: { id: session.tenantId! },
      select: { address: true, zipcode: true },
    }),
    db.dunningEntry.findMany({
      // paidAt: null — 납부 확인된 세대에 내용증명이 나가면 안 된다.
      // 발송은 되돌릴 수 없고, 화면의 납부 표시와 목록이 어긋나면 분쟁이 된다.
      where: { docId, stage: 3, paidAt: null },
      orderBy: [{ dong: "asc" }, { ho: "asc" }],
    }),
  ]);
  if (entries.length === 0)
    return new NextResponse("내용증명 대상 세대가 없습니다.", { status: 404 });

  // 접속기록 — 성명·주소가 담긴 개인정보 파일의 반출이다
  await logAccess("postal_export", {
    tenantId: session.tenantId,
    userId: session.userId,
    detail: `${doc.docNo ?? docId} ${entries.length}세대`,
  });

  const XLSX = await import("xlsx");
  const ws = XLSX.utils.aoa_to_sheet([
    ["성명", "우편번호", "주소"],
    ...entries.map((e) => [
      e.name ?? "입주자",
      tenant.zipcode ?? "", // 설정 > 단지 정보의 우편번호 — 단지가 하나라 전 세대 동일
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
