"use client";

import { useActionState, useState } from "react";
import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateNoticePosting } from "../approval-actions";

/**
 * 게시장소·게시기간 — 결재받은 내용이 아니라 게시 실무라 여기서 바로 고친다.
 * 단지마다 붙이는 자리가 다르고(승강기만 쓰는 곳, 동 출입구까지 붙이는 곳),
 * 게시 종료도 "완료 시"가 아니라 특정 날짜인 경우가 있다.
 *
 * 후보 목록·기본값은 props로 받는다 — `@/lib/gian/notice`를 여기서 import하면
 * 그 모듈이 물고 있는 Prisma까지 클라이언트 번들로 끌려온다(실제로 500이 났다).
 */
export function NoticePosting({
  docId,
  place,
  checked,
  custom,
  postTo,
  options,
  defaultPostTo,
}: {
  docId: string;
  /** 지금 값 — 접힌 상태에서 그대로 보여 준다 */
  place: string;
  checked: string[];
  custom: string;
  postTo: string;
  options: readonly string[];
  defaultPostTo: string;
}) {
  const [state, action, pending] = useActionState(
    updateNoticePosting,
    undefined,
  );
  const [open, setOpen] = useState(false);

  if (!open)
    return (
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-[var(--gian-line)] bg-[var(--gian-card)] px-4 py-3 text-sm print:hidden">
        <MapPin className="size-4 shrink-0 text-[var(--gian-ink-soft)]" />
        <span>
          게시장소 <b>{place}</b>
        </span>
        <span className="text-[var(--gian-ink-soft)]">·</span>
        <span>
          게시기간 <b>{postTo}</b>까지
        </span>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={() => setOpen(true)}
        >
          게시 설정
        </Button>
      </div>
    );

  return (
    <form
      action={action}
      className="mb-4 space-y-4 rounded-lg border border-[var(--gian-line)] bg-[var(--gian-card)] p-4 text-sm print:hidden"
    >
      <input type="hidden" name="docId" value={docId} />

      <fieldset>
        <legend className="mb-2 font-semibold">게시장소</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {options.map((p) => (
            <label key={p} className="flex cursor-pointer items-center gap-1.5">
              <input
                type="checkbox"
                name="places"
                value={p}
                defaultChecked={checked.includes(p)}
                className="size-3.5 accent-[var(--gian-ok)]"
              />
              {p}
            </label>
          ))}
        </div>
        <Input
          name="customPlace"
          defaultValue={custom}
          placeholder="그 밖의 장소 (쉼표로 구분)"
          className="mt-2 max-w-md bg-[var(--gian-paper)]"
        />
      </fieldset>

      <div>
        <label htmlFor="postTo" className="mb-1 block font-semibold">
          게시기간
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            id="postTo"
            name="postTo"
            defaultValue={postTo}
            placeholder={defaultPostTo}
            className="max-w-xs bg-[var(--gian-paper)]"
          />
          <span className="text-[var(--gian-ink-soft)]">까지</span>
        </div>
        <p className="mt-1 text-xs text-[var(--gian-ink-soft)]">
          비워 두면 &ldquo;{defaultPostTo}&rdquo;로 들어갑니다. 날짜로 못
          박으려면 &ldquo;2026년 8월 20일&rdquo;처럼 적어 주세요.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "저장 중..." : "저장"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          취소
        </Button>
        {state?.error && (
          <p className="w-full text-destructive">{state.error}</p>
        )}
      </div>
    </form>
  );
}
