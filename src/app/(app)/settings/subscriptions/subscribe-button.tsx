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
}: {
  moduleId: string;
  moduleName: string;
  price: number;
  subscribed: boolean;
}) {
  const [pending, startTransition] = useTransition();

  const toggle = () =>
    startTransition(async () => {
      try {
        await setSubscription(moduleId, !subscribed);
        toast.success(
          subscribed ? "구독이 해지되었습니다." : "구독이 시작되었습니다.",
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
      trigger={<Button disabled={pending}>구독하기</Button>}
      title={`${moduleName} 구독을 시작할까요?`}
      description={`월 ${price.toLocaleString()}원이 청구됩니다.`}
      confirmLabel="구독 시작"
      onConfirm={toggle}
    />
  );
}
