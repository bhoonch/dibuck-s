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

  // 첨부는 불변 리소스다(내용이 바뀌면 새 id) — 재열람은 브라우저 캐시가 다 걷는다.
  // inline은 스크립트를 실을 수 없는 형식(SVG 제외 이미지·PDF)만 — 그 외가 저장돼
  // 있었더라도(업로드 검증 이전 데이터) 다운로드로 강등해 앱 오리진 실행을 막는다.
  const inlineSafe =
    (att.mime.startsWith("image/") && att.mime !== "image/svg+xml") ||
    att.mime === "application/pdf";
  return new NextResponse(att.data, {
    headers: {
      "Content-Type": att.mime,
      "Content-Disposition": `${inlineSafe ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(att.name)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=31536000, immutable",
      ETag: `"${att.sha256}"`,
    },
  });
}
