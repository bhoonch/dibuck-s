import { TriangleAlert } from "lucide-react";

/**
 * "지금 이 문서에서 채워야 할 것" 한 장 — 공고문 게시 전 일정 확정,
 * 초안의 미확정 추진일정처럼 **막지는 않지만 그냥 지나치면 안 되는** 안내.
 *
 * 배경색을 깔지 않는다: 이 화면에서 색이 있는 자리는 결재 판정과 문서 자체이고,
 * 안내가 색을 가져가면 정작 봐야 할 곳과 경쟁한다. 신호는 아이콘 하나로 충분하다.
 * (앰버 배경 버전을 두 번 시도했다가 둘 다 "색이 진하다"로 되돌렸다 — 다시 깔지 말 것)
 */
export function AttentionCard({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  /** 고치러 가는 버튼·폼 — 안내만 하고 길을 안 내주면 두 번 찾게 된다 */
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 rounded-lg border bg-card p-4 print:hidden">
      <p className="flex items-center gap-2 text-sm font-bold">
        <TriangleAlert className="size-4 shrink-0 text-[var(--gian-warn)]" />
        {title}
      </p>
      <div className="mt-1 text-sm text-muted-foreground">{children}</div>
      {action}
    </div>
  );
}
