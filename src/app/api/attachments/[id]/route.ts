import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * 첨부 열람 — 신뢰 경계. 같은 단지의 로그인 사용자만.
 * 이 확인이 없으면 id만 알면 남의 단지 견적서를 읽는다.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.tenantId)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const att = await db.documentAttachment.findUnique({
    where: { id: (await params).id },
    include: { document: { select: { tenantId: true } } },
  });
  if (!att || att.document.tenantId !== session.tenantId)
    return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!att.data)
    // 폐기된 문서 — 파일 본문은 비웠고 이름·해시만 기록으로 남아 있다
    return NextResponse.json({ error: "purged" }, { status: 410 });

  return new NextResponse(Buffer.from(att.data), {
    headers: {
      "Content-Type": att.mime,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(att.name)}`,
      "Cache-Control": "private, max-age=0",
    },
  });
}
