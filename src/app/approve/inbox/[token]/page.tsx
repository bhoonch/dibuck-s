import Link from "next/link";
import { db } from "@/lib/db";
import { ymdKst } from "@/lib/utils";
import { docStatusLabels, docStatusStyles } from "@/lib/labels";
import { approverRoleLabel, type ExternalApprover } from "@/lib/gian/rules";

/**
 * 외부 결재자(회장·감사)의 결재함 — 로그인 없음, 토큰이 곧 권한.
 *
 * 문서별 서명 링크(`/approve/[token]`)는 7일이면 만료되고 카톡 대화에 흩어진다.
 * 그래서 **지난 결재 건을 다시 볼 방법이 없었다** — 승인 서명을 한 당사자가
 * 자기가 무엇에 서명했는지 확인할 수 없는 상태였다. 이 화면이 그 목록이다.
 *
 * 서명 토큰은 서명 후에도 지워지지 않으므로(`actOnStep`), 지난 건은 원래의
 * 서명 링크가 그대로 열람 화면이 된다(`tokenState`가 "done"으로 판정해 읽기 전용).
 * 그래서 여기서 새로 만드는 것은 목록뿐이고 열람 경로는 하나로 유지된다.
 */
export default async function ApproverInboxPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const shell = (children: React.ReactNode) => (
    <main className="mx-auto min-h-screen max-w-3xl space-y-4 p-4">
      <p className="text-lg font-bold tracking-tight text-primary">디벅</p>
      {children}
    </main>
  );
  const notice = (text: string) =>
    shell(
      <div className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
        {text}
      </div>,
    );

  // 토큰 앞부분이 단지 id — JSON 안을 뒤지지 않고 인덱스로 한 번에 찾는다
  const tenantId = token.split(".")[0];
  const tenant = tenantId
    ? await db.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true, externalApprovers: true },
      })
    : null;
  const me = ((tenant?.externalApprovers as ExternalApprover[] | null) ?? []).find(
    (e) => e.token === token,
  );
  // 링크를 새로 발급하면 옛 링크는 여기서 걸린다 — 회장이 바뀌었을 때의 회수 경로다
  if (!tenant || !me) return notice("유효하지 않은 링크입니다. 관리사무소에 문의해 주세요.");

  const steps = await db.approvalStep.findMany({
    where: { externalRole: me.role, document: { tenantId } },
    select: {
      id: true,
      status: true,
      token: true,
      actedAt: true,
      document: {
        select: { id: true, docNo: true, title: true, createdAt: true },
      },
    },
    orderBy: { document: { createdAt: "desc" } },
    take: 100,
  });

  /*
   * 차례가 온 건이 위 — 결재함을 여는 이유는 대부분 "지금 할 게 있나"다.
   * status "waiting"(앞 결재자 차례라 아직 토큰이 없다)은 어느 쪽에도 넣지 않는다:
   * 링크가 없어 열 수 없고, 내 차례도 아닌 문서를 결재함에 세우면 목록만 흐려진다.
   */
  const myTurn = steps.filter((s) => s.status === "pending");
  const past = steps.filter(
    (s) => s.status === "approved" || s.status === "rejected",
  );

  const row = (s: (typeof steps)[number], action: string) => {
    const body = (
      <>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{s.document.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {s.document.docNo} · {ymdKst(s.actedAt ?? s.document.createdAt)}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
            docStatusStyles[s.status === "approved" ? "final" : s.status] ?? ""
          }`}
        >
          {s.status === "approved"
            ? "승인함"
            : s.status === "rejected"
              ? "반려함"
              : (docStatusLabels[s.status] ?? s.status)}
        </span>
      </>
    );
    const box = "flex items-center gap-3 rounded-lg border bg-card p-4";
    return (
      <li key={s.id}>
        {/*
          토큰 없이 처리된 단계가 실제로 있다 — 문서 화면에서 직접 승인 처리된 건은
          서명 링크가 발급된 적이 없다. 링크를 걸면 /approve/null로 나가므로,
          기록은 보여주되 열지는 못한다고 적는다(빈 줄로 감추면 "내 결재가 사라졌다"가 된다).
        */}
        {s.token ? (
          <Link href={`/approve/${s.token}`} className={`${box} hover:bg-muted`}>
            {body}
            <span className="shrink-0 text-sm text-primary underline underline-offset-2">
              {action}
            </span>
          </Link>
        ) : (
          <div className={box}>
            {body}
            <span className="shrink-0 text-xs text-muted-foreground">
              열람 링크 없음
            </span>
          </div>
        )}
      </li>
    );
  };

  return shell(
    <>
      <div>
        <h1 className="text-xl font-bold tracking-tight">결재함</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {tenant.name} · {me.name} ({approverRoleLabel(me)})
        </p>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-bold">결재할 문서 {myTurn.length}건</h2>
        {myTurn.length === 0 ? (
          <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
            지금 결재할 문서가 없습니다.
          </p>
        ) : (
          <ul className="space-y-2">{myTurn.map((s) => row(s, "결재하기"))}</ul>
        )}
      </section>

      {past.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold">지난 결재 {past.length}건</h2>
          <ul className="space-y-2">{past.map((s) => row(s, "열람"))}</ul>
        </section>
      )}

      <p className="text-xs text-muted-foreground">
        이 링크는 본인 전용입니다. 다른 사람에게 전달하지 마세요 — 링크를 가진
        사람은 위 문서를 열람할 수 있습니다. 유출됐다면 관리사무소에 링크 재발급을
        요청해 주세요.
      </p>
    </>,
  );
}
