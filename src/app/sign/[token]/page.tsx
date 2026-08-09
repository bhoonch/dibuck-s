import { db } from "@/lib/db";
import { signTokenState, type MeetingMeta } from "@/lib/minutes";
import { MinutesPaper } from "@/components/minutes-paper";
import { PaperScale } from "@/components/paper-scale";
import { SignForm } from "./sign-form";

/**
 * 회의록 전자서명 페이지 — 로그인 없음, 토큰이 곧 권한.
 * 결재(/approve/[token])와 다른 라우트다: 서명은 결재가 아니고, 완성(final)
 * 문서에서만 열리며, 참석자 전원이 병렬로 서명한다(순서 없음, 반려 없음).
 */
export default async function SignByTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const step = await db.approvalStep.findUnique({
    where: { token },
    include: { document: true },
  });
  const state = signTokenState(step, step?.document.status);

  const shell = (children: React.ReactNode) => (
    <main className="mx-auto min-h-screen max-w-3xl space-y-4 p-4 lg:max-w-[1180px]">
      <p className="text-lg font-bold tracking-tight text-primary">디벅</p>
      {children}
    </main>
  );

  if (state === "done")
    return shell(
      <div className="rounded-lg border bg-card p-6 text-center text-sm font-medium">
        이미 서명하셨습니다.
      </div>,
    );

  if (state !== "valid")
    return shell(
      <div className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
        {state === "expired" ? (
          <>
            링크 유효기간(7일)이 지났습니다.
            <br />
            관리사무소에 재발급을 요청하세요.
          </>
        ) : (
          "유효하지 않은 링크입니다."
        )}
      </div>,
    );

  const doc = step!.document;
  const meta = doc.meta as MeetingMeta;
  const signSteps = await db.approvalStep.findMany({
    where: { documentId: doc.id },
    orderBy: { order: "asc" },
  });
  const [ymd, hm] = meta.meetingAt.split(" ");
  const [y, m, d] = ymd.split("-");
  const meetingAtDisplay = `${y}년 ${Number(m)}월 ${Number(d)}일 ${hm}`;

  return shell(
    <>
      <p className="text-sm text-muted-foreground">
        {doc.docNo} · {step!.name}님 회의록 서명 요청
      </p>

      {/* 모바일(카톡 링크가 주 입구)은 사유→서명→용지 세로. PC는 용지를 왼쪽, 서명을 오른쪽에 — approve/[token]과 같은 문법 */}
      <div className="lg:grid lg:grid-cols-[minmax(0,794px)_340px] lg:items-start lg:gap-6">
        <aside className="space-y-4 lg:sticky lg:top-4 lg:col-start-2 lg:row-start-1">
          <SignForm token={token} signerName={step!.name} />
        </aside>

        <div className="mt-4 min-w-0 lg:col-start-1 lg:row-start-1 lg:mt-0">
          <PaperScale>
            <MinutesPaper
              docNo={doc.docNo ?? ""}
              meetingNo={meta.meetingNo}
              meetingAt={meetingAtDisplay}
              place={meta.place}
              attendees={meta.attendees}
              agendas={meta.minutes ?? []}
              steps={signSteps.map((s) => ({
                order: s.order,
                status: s.status,
                actedAt: s.actedAt,
                name: s.name,
              }))}
              id="sign-sheet"
            />
          </PaperScale>
        </div>
      </div>
    </>,
  );
}
