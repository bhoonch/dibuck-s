"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { voidNoticePost } from "../actions";

/** 폐기 — 게시 카드 하단 자리 (결재 파생 공고문의 NoticeVoid와 같은 문법) */
export function VoidButton({ docId }: { docId: string }) {
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
            게시물 폐기
          </Button>
        }
        title="이 게시물을 폐기할까요?"
        description="목록에는 '폐기'로 남고 열람만 됩니다. 같은 내용이 필요하면 새로 만들어 주세요."
        confirmLabel="폐기"
        destructive
        onConfirm={() =>
          startTransition(async () => {
            const r = await voidNoticePost(docId);
            if (r?.error) setError(r.error);
          })
        }
      />
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </>
  );
}
