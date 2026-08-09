import Link from "next/link";
import { CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * 모듈 홈 머리의 [사용법] — /guide의 해당 모듈 항목을 펼친 채로 연다.
 *
 * 해시(`#repairs`)가 아니라 쿼리(`?m=repairs`)인 이유: 해시는 서버로 가지 않아
 * 첫 렌더가 무조건 첫 항목("처음 시작")이 되고, 클라이언트가 뒤늦게 바꿔야 한다.
 * 쿼리면 서버가 처음부터 맞는 항목을 그린다.
 */
export function GuideLink({ section }: { section: string }) {
  return (
    <Button asChild variant="ghost" size="lg" className="text-muted-foreground">
      <Link href={`/guide?m=${section}`}>
        <CircleHelp className="size-4" /> 사용법
      </Link>
    </Button>
  );
}
