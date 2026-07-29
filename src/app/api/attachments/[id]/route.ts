import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { tokenState } from "@/lib/gian/approval";

/**
 * 첨부 열람 — 신뢰 경계. 두 갈래로만 허용한다.
 *
 * ① 로그인 사용자: 같은 단지의 문서여야 한다. 이 확인이 없으면 id만 알면 남의 견적서를 읽는다.
 * ② 외부 결재자(회장·감사): 세션이 없으므로 `?token=`으로 온다. 그 토큰이 **이 문서의**
 *    유효한 결재 단계여야 한다 — 다른 문서 토큰으로 남의 첨부를 여는 길을 막는다.
 *    증빙을 보고 판단해야 할 사람이 증빙을 못 보면 결재가 형식이 된다.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const att = await db.documentAttachment.findUnique({
    where: { id: (await params).id },
    include: { document: { select: { id: true, tenantId: true, status: true } } },
  });

  const token = new URL(req.url).searchParams.get("token");
  let allowed = false;

  if (token) {
    const step = await db.approvalStep.findUnique({
      where: { token },
      include: { document: { select: { id: true, status: true } } },
    });
    const state = tokenState(step, step?.document.status);
    // 서명 페이지가 문서를 보여주는 조건과 같다 (valid=결재 차례, done=이미 처리)
    allowed =
      !!att &&
      !!step &&
      step.document.id === att.document.id &&
      (state === "valid" || state === "done");
  } else {
    const session = await getSession();
    if (!session?.tenantId)
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    allowed = !!att && att.document.tenantId === session.tenantId;
  }

  if (!att || !allowed)
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
