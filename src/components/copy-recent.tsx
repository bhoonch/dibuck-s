import { ChevronDown, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * 작성 화면 입구의 복제 카드 — 기안·공지문 공용. 반복 문서는 재생성(AI 대기·
 * 일일 한도)보다 복사가 빠르다는 걸, AI 생성을 태우기 직전 지점에서 알려준다.
 * native details라 JS 없이 접히고, 복제 폼은 작성 폼 밖이라 폼 중첩도 없다.
 */
export function CopyRecent({
  title,
  items,
  action,
}: {
  /** 카드 제목 (예: "지난 기안 복제") */
  title: string;
  items: { id: string; title: string; date: string }[];
  /** 모듈별 복제 서버 액션 — 성공 시 새 초안으로 redirect */
  action: (docId: string) => Promise<void>;
}) {
  if (items.length === 0) return null;
  return (
    <details className="group mb-5 rounded-md border border-primary/40 bg-accent/50">
      <summary className="flex cursor-pointer items-center gap-2 px-3.5 py-3 text-sm [&::-webkit-details-marker]:hidden">
        <Copy className="size-4 shrink-0 text-primary" />
        <span className="font-semibold">{title}</span>
        <span className="hidden text-muted-foreground sm:inline">
          AI 생성 없이 바로 초안이 됩니다
        </span>
        <ChevronDown className="ml-auto size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <ul className="divide-y border-t bg-background">
        {items.map((d) => (
          <li
            key={d.id}
            className="flex items-center gap-2 px-3.5 py-2 text-sm"
          >
            <span className="min-w-0 flex-1 truncate">{d.title}</span>
            <span className="shrink-0 font-mono text-xs text-muted-foreground">
              {d.date}
            </span>
            <form action={action.bind(null, d.id)}>
              <Button type="submit" variant="outline" size="xs">
                복제
              </Button>
            </form>
          </li>
        ))}
      </ul>
    </details>
  );
}
