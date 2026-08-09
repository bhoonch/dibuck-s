"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { voidMinutes } from "../actions";

/**
 * 폐기 — 완성 전(번호 없는) 초안은 흔적 없이 삭제되고, 완성본은 '폐기'로 남는다
 * (safety-training VoidButton과 같은 규칙). 완성본을 폐기해도 그 의결(Resolution)은
 * 유효한 채로 남는다 — 후속 조치 추적은 계속된다.
 */
export function VoidButton({ docId, draft }: { docId: string; draft: boolean }) {
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
            {draft ? "초안 삭제" : "회의록 폐기"}
          </Button>
        }
        title={draft ? "이 초안을 삭제할까요?" : "이 회의록을 폐기할까요?"}
        description={
          draft
            ? "완성 전 초안이라 번호 없이 삭제됩니다."
            : "목록에는 '폐기'로 남고 열람만 됩니다. 등록된 의결사항은 그대로 유효합니다."
        }
        confirmLabel={draft ? "삭제" : "폐기"}
        destructive
        onConfirm={() =>
          startTransition(async () => {
            const r = await voidMinutes(docId);
            if (r?.error) setError(r.error);
          })
        }
      />
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </>
  );
}
