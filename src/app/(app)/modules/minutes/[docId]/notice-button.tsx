"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { createResolutionNotice } from "../actions";

/**
 * 완성 회의록 → 의결 공고문 파생. 실패해도 완성은 그대로다 — 다시 누르면 된다.
 * 의결사항이 없으면 서버가 에러를 돌려준다(사전 비활성화 대신 서버 검사에 맡긴다).
 */
export function NoticeButton({ docId }: { docId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <>
      <Button
        variant="outline"
        className="w-full"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await createResolutionNotice(docId);
            if (r?.error) setError(r.error);
          })
        }
      >
        의결 공고문 만들기
      </Button>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </>
  );
}
