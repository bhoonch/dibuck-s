"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/*
 * 브라우저 인쇄 = A4 출력·PDF 저장 겸용 — @page 규칙은 문서 페이지에 있다.
 *
 * blocked를 주면 버튼을 잠근다. 팝업으로 경고하지 않는 이유: window.print()는 가로챌 수
 * 있어도 Ctrl+P와 브라우저 메뉴 인쇄는 못 막아 어차피 새는 데다, 같은 경고를 화면 위
 * 카드가 이미 하고 있다. 막을 거면 버튼을 잠그는 쪽이 확실하고 조용하다.
 */
export function PrintButton({ blocked }: { blocked?: string }) {
  if (blocked)
    return (
      <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
        <Button variant="outline" disabled>
          <Printer className="size-4" /> A4 인쇄 · PDF 저장
        </Button>
        <span className="text-xs text-[var(--gian-warn)]">{blocked}</span>
      </div>
    );
  return (
    <Button variant="outline" onClick={() => window.print()}>
      <Printer className="size-4" /> A4 인쇄 · PDF 저장
    </Button>
  );
}
