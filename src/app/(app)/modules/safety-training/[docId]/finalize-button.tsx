"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { finalizeTrainingLog } from "../actions";

/** 초안 → 완성: 문서번호가 부여되고 인쇄가 열린다 */
export function FinalizeButton({ docId }: { docId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <>
      <Button
        size="lg"
        className="mt-3"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await finalizeTrainingLog(docId);
            if (r && "error" in r && r.error) setError(r.error);
          })
        }
      >
        {pending && <Loader2 className="size-4 animate-spin" />} 일지 완성
      </Button>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </>
  );
}
