"use client";

import { useTransition } from "react";
import { AlertTriangle } from "lucide-react";
import { cancelTenantDeletion } from "@/app/account/actions";

/**
 * 탈퇴 유예 배너 — 유예 동안 계속 보이고, 여기서 되돌릴 수 있다.
 * 마스터가 아니면 취소 버튼 없이 사실만 알린다(취소는 마스터 권한).
 */
export function DeletionBanner({
  daysLeft,
  canCancel,
}: {
  daysLeft: number;
  canCancel: boolean;
}) {
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700">
      <AlertTriangle className="size-4 shrink-0" />
      탈퇴가 신청되었습니다 — <b>{daysLeft}일 뒤</b> 단지와 모든 데이터가
      삭제됩니다. 그때까지는 지금처럼 사용하실 수 있습니다.
      {canCancel && (
        <button
          type="button"
          disabled={pending}
          onClick={() => start(() => cancelTenantDeletion())}
          className="font-semibold underline underline-offset-2 disabled:opacity-50"
        >
          {pending ? "취소하는 중..." : "탈퇴 취소하기"}
        </button>
      )}
    </div>
  );
}
