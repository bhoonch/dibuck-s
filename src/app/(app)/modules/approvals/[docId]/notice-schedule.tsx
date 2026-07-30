"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AttentionCard } from "@/components/attention-card";
import { updateNoticeSchedule } from "../approval-actions";

/**
 * 게시 전 일정 확정 — 결재 문서는 "8월 중"으로 통과시키되, 입주민에게 나가는
 * 공고문에는 확정 일자를 받는다. 결재를 막지 않으면서 잘못된 공고만 걸러 낸다.
 */
export function NoticeSchedule({
  docId,
  current,
  label,
}: {
  docId: string;
  current: string;
  /** "공사일자" 또는 "시행일자" — 문서 종류에 따라 다르다 */
  label: string;
}) {
  const [state, action, pending] = useActionState(
    updateNoticeSchedule,
    undefined,
  );
  const [open, setOpen] = useState(false);

  return (
    <AttentionCard
      title={`게시 전에 ${label}를 확정해 주세요`}
      action={
        open ? (
          <form action={action} className="mt-3 flex flex-wrap items-center gap-2">
            <input type="hidden" name="docId" value={docId} />
            <Input
              name="schedule"
              defaultValue={current}
              placeholder="예: 2026년 8월 10일(월) ~ 8월 14일(금)"
              className="max-w-md"
              autoFocus
            />
            <Button type="submit" disabled={pending}>
              {pending ? "저장 중..." : "저장"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              취소
            </Button>
            {state?.error && (
              <p className="w-full text-sm text-destructive">{state.error}</p>
            )}
          </form>
        ) : (
          <Button variant="outline" className="mt-3" onClick={() => setOpen(true)}>
            일정 고치기
          </Button>
        )
      }
    >
      지금 값은 &ldquo;{current}&rdquo;입니다. 입주민 공고문에 대략적인 일정이
      실리면 &ldquo;언제냐&rdquo;는 문의가 관리사무소로 돌아옵니다.
    </AttentionCard>
  );
}
