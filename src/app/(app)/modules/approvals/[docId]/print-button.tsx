"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/* 브라우저 인쇄 = A4 출력·PDF 저장 겸용 — @page 규칙은 문서 페이지에 있다 */
export function PrintButton() {
  return (
    <Button variant="outline" onClick={() => window.print()}>
      <Printer className="size-4" /> A4 인쇄 · PDF 저장
    </Button>
  );
}
