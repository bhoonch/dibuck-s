"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { voidInspectionRecord } from "../actions";

/** 폐기 — 대장에 '폐기'로 남고 열람만 된다. 앵커(마지막 실시일)는 되돌리지 않는다 */
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
        title="이 점검 기록을 폐기할까요?"
        description="목록에는 '폐기'로 남고 열람만 됩니다. 실시일이 잘못됐다면 새 기록을 만들고 [항목 관리]에서 기준일을 확인해 주세요."
        confirmLabel="폐기"
        destructive
        onConfirm={() =>
          startTransition(async () => {
            const r = await voidInspectionRecord(docId);
            if (r && "error" in r && r.error) setError(r.error);
          })
        }
      />
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </>
  );
}
