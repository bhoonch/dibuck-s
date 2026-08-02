"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { voidTrainingLog } from "../actions";

/**
 * 폐기 — 완성 전 초안은 번호가 없어 흔적 없이 삭제되고, 완성본은 '폐기'로 남는다
 * (공지문과 같은 규칙).
 */
export function VoidButton({ docId, draft }: { docId: string; draft: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <>
      {/* outline + 빨간 글씨 — ghost는 테두리가 없어 버튼이 아니라 글씨로 읽힌다 */}
      <ConfirmDialog
        trigger={
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            disabled={pending}
          >
            {draft ? "초안 삭제" : "일지 폐기"}
          </Button>
        }
        title={draft ? "이 초안을 삭제할까요?" : "이 일지를 폐기할까요?"}
        description={
          draft
            ? "완성 전 초안이라 번호 없이 삭제됩니다. 필요하면 새로 만들어 주세요."
            : "목록에는 '폐기'로 남고 열람만 됩니다. 같은 교육이 필요하면 새로 만들어 주세요."
        }
        confirmLabel={draft ? "삭제" : "폐기"}
        destructive
        onConfirm={() =>
          startTransition(async () => {
            const r = await voidTrainingLog(docId);
            if (r?.error) setError(r.error);
          })
        }
      />
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </>
  );
}
