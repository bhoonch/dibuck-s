"use client";

import { useActionState, useState } from "react";
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
    /*
      색은 경고(주황) 그대로 — 이 앱에서 붉은색은 반려·폐기·오류 전용이고,
      일정 미확정은 오류가 아니라 게시 전에 채워야 할 값이다.
      대신 왼쪽 굵은 띠와 큰 아이콘으로 존재감만 올린다(그냥 지나치던 카드였다).
    */
    <div className="mb-4 rounded-lg border border-l-4 border-[var(--gian-warn)]/40 border-l-[var(--gian-warn)] bg-[var(--gian-warn-soft)] p-4 print:hidden">
      <p className="flex items-center gap-2 text-base font-bold text-[var(--gian-warn)]">
        <CalendarClock className="size-5 shrink-0" />
        게시 전에 {label}를 확정해 주세요
      </p>
      <p className="mt-1 text-sm text-[var(--gian-warn)]/90">
        지금 값은 &ldquo;{current}&rdquo;입니다. 입주민 공고문에 대략적인 일정이
        실리면 &ldquo;언제냐&rdquo;는 문의가 관리사무소로 돌아옵니다.
        <b> 확정 전에는 인쇄할 수 없습니다.</b>
      </p>
      {open ? (
        <form action={action} className="mt-3 flex flex-wrap items-center gap-2">
          <input type="hidden" name="docId" value={docId} />
          <Input
            name="schedule"
            defaultValue={current}
            placeholder="예: 2026년 8월 10일(월) ~ 8월 14일(금)"
            className="max-w-md bg-card"
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
      )}
    </div>
  );
}
