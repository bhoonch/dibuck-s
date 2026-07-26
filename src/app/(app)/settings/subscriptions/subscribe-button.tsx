"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { setSubscription } from "../actions";

export function SubscribeButton({
  moduleId,
  moduleName,
  price,
  subscribed,
  trialEligible,
}: {
  moduleId: string;
  moduleName: string;
  price: number;
  subscribed: boolean;
  /** 한 번도 구독한 적 없으면 30일 무료 체험으로 시작 */
  trialEligible: boolean;
}) {
  const [pending, startTransition] = useTransition();

  const toggle = () =>
    startTransition(async () => {
      try {
        await setSubscription(moduleId, !subscribed);
        toast.success(
          subscribed
            ? "구독이 해지되었습니다."
            : trialEligible
              ? "30일 무료 체험이 시작되었습니다."
              : "구독이 시작되었습니다.",
        );
      } catch {
        toast.error("처리에 실패했습니다.");
      }
    });

  return subscribed ? (
    <ConfirmDialog
      trigger={
        <Button variant="outline" disabled={pending}>
          해지
        </Button>
      }
      title={`${moduleName} 구독을 해지할까요?`}
      description="해지하면 사이드바에서 잠기고 사용할 수 없습니다. 만든 문서는 문서함에 남아 있습니다."
      confirmLabel="해지"
      destructive
      onConfirm={toggle}
    />
  ) : (
    <ConfirmDialog
      trigger={
        <Button disabled={pending}>
          {trialEligible ? "무료 체험" : "구독하기"}
        </Button>
      }
      title={
        trialEligible
          ? `${moduleName} 무료 체험을 시작할까요?`
          : `${moduleName} 구독을 시작할까요?`
      }
      description={
        trialEligible
          ? `30일 동안 무료로 사용합니다. 체험 기간에는 요금이 없고, 이후 월 ${price.toLocaleString()}원입니다.`
          : `월 ${price.toLocaleString()}원이 청구됩니다.`
      }
      confirmLabel={trialEligible ? "무료 체험 시작" : "구독 시작"}
      onConfirm={toggle}
    />
  );
}
