"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { completeInspectionAction } from "../actions";

/** 이상 판정 조치 마감 — 안전진단 신청·수리를 실제로 마쳤을 때 사람이 누른다 */
export function CompleteActionButton({ docId }: { docId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      disabled={pending}
      onClick={() => startTransition(() => completeInspectionAction(docId).then(() => {}))}
    >
      조치 완료
    </Button>
  );
}
