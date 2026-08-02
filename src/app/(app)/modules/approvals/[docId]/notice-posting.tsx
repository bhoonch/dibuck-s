"use client";

import { useActionState, useState } from "react";
import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { panel, panelTitle } from "@/components/gian-ui";
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
  children,
  saveAction = updateNoticePosting,
}: {
  docId: string;
  /** 카드 바닥에 붙는 것 — 폐기처럼 되돌릴 수 없는 일 (결재 패널 하단과 같은 자리) */
  children?: React.ReactNode;
  /** 지금 값 — 접힌 상태에서 그대로 보여 준다 */
  place: string;
  checked: string[];
  custom: string;
  postTo: string;
  options: readonly string[];
  defaultPostTo: string;
  /** 공지문 모듈도 같은 카드를 쓴다 — 저장 액션만 자기 것으로 갈아 끼운다 */
  saveAction?: typeof updateNoticePosting;
}) {
  const [state, action, pending] = useActionState(saveAction, undefined);
  const [open, setOpen] = useState(false);

  if (!open)
    return (
      /* 320 패널 안에서는 가로 한 줄이 안 나온다 — 결재선 패널과 같은 문법의 세로 목록으로 */
      <div className={`${panel} text-sm print:hidden`}>
        <h4 className={`${panelTitle} flex items-center gap-1.5`}>
          <MapPin className="size-3.5 shrink-0" />
          게시
        </h4>
        <p>
          <span className="text-[var(--gian-ink-soft)]">장소</span>{" "}
          <b>{place}</b>
        </p>
        <p className="mt-1">
          <span className="text-[var(--gian-ink-soft)]">기간</span>{" "}
          <b>{postTo}</b>까지
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => setOpen(true)}
        >
          게시 설정
        </Button>
        {children && (
          <div className="mt-3 border-t border-[var(--gian-line)] pt-3">
            {children}
          </div>
        )}
      </div>
    );

  return (
    <form
      action={action}
      className="space-y-4 rounded-lg border border-[var(--gian-line)] bg-[var(--gian-card)] p-4 text-sm print:hidden"
    >
      <input type="hidden" name="docId" value={docId} />

      <fieldset>
        <legend className="mb-2 font-semibold">게시장소</legend>
        {/* 320 패널에서는 가로로 안 서니 세로로 쌓는다 — 좁을수록 목록이 읽기 쉽다 */}
        <div className="flex flex-col gap-2">
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
          className="mt-2 bg-[var(--gian-paper)]"
        />
      </fieldset>

      <div>
        <label htmlFor="postTo" className="mb-1 block font-semibold">
          게시기간
        </label>
        {/* wrap 금지 — 입력칸이 폭을 다 먹으면 "까지"가 혼자 다음 줄로 떨어진다 */}
        <div className="flex items-center gap-2">
          <Input
            id="postTo"
            name="postTo"
            defaultValue={postTo}
            placeholder={defaultPostTo}
            className="min-w-0 flex-1 bg-[var(--gian-paper)]"
          />
          <span className="shrink-0 text-[var(--gian-ink-soft)]">까지</span>
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
