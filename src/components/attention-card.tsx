import { TriangleAlert } from "lucide-react";

/**
 * "지금 이 문서에서 채워야 할 것" 한 장 — 공고문 게시 전 일정 확정,
 * 초안의 미확정 추진일정처럼 **막지는 않지만 그냥 지나치면 안 되는** 안내.
 *
 * 배경은 연한 청색(--gian-navy-soft) — 공고문 표 헤더·괘선과 같은 계열이라 이 문서
 * 화면의 색으로 읽힌다. 앰버가 아닌 이유는 두 가지다: 이 카드는 막는 경고가 아니라
 * 지나치면 안 되는 안내고, 예전에 두 번 되돌린 앰버 판은 **배경과 글자를 같이 칠해서**
 * 카드가 통째로 노란 덩어리가 됐다. 주의 신호는 앰버 아이콘 하나가 진다 —
 * 배경색을 글자·테두리까지 번지게 하지 말 것.
 */
export function AttentionCard({
  title,
  children,
  action,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  /** 고치러 가는 버튼·폼 — 안내만 하고 길을 안 내주면 두 번 찾게 된다 */
  action?: React.ReactNode;
  /** 바깥 여백은 두는 쪽이 정한다 — 세로 목록 안에 놓이면 자기 margin이 간격을 어긋낸다 */
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg border bg-[var(--gian-navy-soft)] p-4 print:hidden ${className}`}
    >
      <p className="flex items-center gap-2 text-sm font-bold">
        <TriangleAlert className="size-4 shrink-0 text-[var(--gian-warn)]" />
        {title}
      </p>
      <div className="mt-1 text-sm text-muted-foreground">{children}</div>
      {action}
    </div>
  );
}
