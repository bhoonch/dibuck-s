"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { voidRepairRecord } from "../actions";

/** 폐기 — 목록에 '폐기'로 남고 열람만 된다. 설비 이력·집계에서 빠진다 */
export function VoidButton({ docId }: { docId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <>
      <ConfirmDialog
        trigger={
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            disabled={pending}
          >
            기록 폐기
          </Button>
        }
        title="이 수선 기록을 폐기할까요?"
        description="목록에는 '폐기'로 남고 열람만 됩니다. 설비 이력과 비용 집계에서 빠집니다."
        confirmLabel="폐기"
        destructive
        onConfirm={() =>
          startTransition(async () => {
            const r = await voidRepairRecord(docId);
            if (r && "error" in r && r.error) setError(r.error);
          })
        }
      />
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </>
  );
}
