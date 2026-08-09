"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { completeRepairRecord } from "../actions";

/** 조치 완료 — 완료일은 서버가 오늘(KST)로 찍는다 */
export function CompleteButton({ docId }: { docId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <>
      <Button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const r = await completeRepairRecord(docId);
            if (r && "error" in r && r.error) setError(r.error);
          })
        }
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <CheckCircle2 className="size-4" />
        )}{" "}
        조치 완료
      </Button>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </>
  );
}
