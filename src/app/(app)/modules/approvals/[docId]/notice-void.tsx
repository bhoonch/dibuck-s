"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { voidGian } from "../approval-actions";

/**
 * 공고문 폐기 — 결재 문서와 달리 결재가 끝난 뒤에도 폐기할 수 있다.
 * 공고문 본문은 결정적 코드 산출물이라 손으로 고칠 수 없어서, 폐기하고 원 품의 화면에서
 * 다시 만드는 것이 유일한 정정 경로다(findNoticeFor가 폐기본을 건너뛴다).
 */
export function NoticeVoid({ docId }: { docId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <>
      <ConfirmDialog
        trigger={
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            disabled={pending}
          >
            공고문 폐기
          </Button>
        }
        title="이 공고문을 폐기할까요?"
        description="목록에는 '폐기'로 남고 열람만 됩니다. 원 품의 화면에서 공고문을 다시 만들 수 있습니다."
        confirmLabel="폐기"
        destructive
        onConfirm={() =>
          startTransition(async () => {
            const r = await voidGian(docId);
            if (r?.error) setError(r.error);
          })
        }
      />
      {error && <p className="w-full text-xs text-destructive">{error}</p>}
    </>
  );
}
