"use client";

import { useState } from "react";
import { loadTossPayments } from "@tosspayments/tosspayments-sdk";
import { CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ensureCustomerKey } from "./actions";

/**
 * 카드 등록 — 토스 결제창을 띄운다.
 * 카드번호는 결제창에서 토스로 직접 가고 우리 서버를 지나지 않는다.
 */
export function RegisterCardButton({
  clientKey,
  customerName,
  customerEmail,
  label = "카드 등록하기",
}: {
  clientKey: string;
  customerName: string;
  customerEmail: string;
  label?: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function open() {
    setPending(true);
    setError(undefined);
    try {
      const customerKey = await ensureCustomerKey();
      const toss = await loadTossPayments(clientKey);
      await toss.payment({ customerKey }).requestBillingAuth({
        method: "CARD",
        successUrl: `${window.location.origin}/api/billing/callback`,
        failUrl: `${window.location.origin}/billing?error=canceled`,
        customerName,
        customerEmail,
      });
    } catch (err) {
      // 사용자가 결제창을 닫은 것도 여기로 온다 — 에러 문구를 크게 띄우지 않는다
      console.error(err);
      setError("카드 등록이 완료되지 않았습니다. 다시 시도해 주세요.");
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button size="lg" onClick={open} disabled={pending}>
        <CreditCard className="size-4" />
        {pending ? "결제창을 여는 중..." : label}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
