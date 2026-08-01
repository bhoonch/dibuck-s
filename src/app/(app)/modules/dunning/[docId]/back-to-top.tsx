"use client";

import { ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * 세대당 1장씩 쌓이는 긴 문서라 아래로 내려가면 돌아올 길이 멀다.
 * 화면 끝의 떠 있는 버튼은 안 보인다는 지적이 있어(사용자 피드백),
 * 문서 옆에 따라다니는 오른쪽 칸(sticky) 안에 넣는다.
 */
export function BackToTop() {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="self-start"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
    >
      <ArrowUp className="size-4" /> 맨 위로
    </Button>
  );
}
