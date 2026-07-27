"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { payNow, requestCancel, undoCancel } from "./actions";

/** 유예·정지 상태에서 즉시 재결제 */
export function PayNowButton() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <div className="space-y-2">
      <Button
        size="lg"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await payNow();
            setError("error" in r ? r.error : undefined);
          })
        }
      >
        {pending ? "결제 중..." : "지금 결제하기"}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

export function CancelButton({ requested }: { requested: boolean }) {
  const [pending, start] = useTransition();

  if (requested)
    return (
      <Button
        variant="outline"
        disabled={pending}
        onClick={() => start(() => undoCancel())}
      >
        해지 예약 철회
      </Button>
    );

  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() => {
        if (
          !confirm(
            "다음 결제일에 모든 모듈 구독이 해지됩니다.\n그때까지는 지금처럼 사용하실 수 있고, 언제든 철회할 수 있습니다.",
          )
        )
          return;
        start(() => requestCancel());
      }}
    >
      구독 해지 예약
    </Button>
  );
}
