"use client";

import { useState, useTransition } from "react";
import { panel, panelTitle } from "@/components/gian-ui";
import { toggleGianAttachment } from "../approval-actions";

/**
 * 첨부 체크리스트 — 파일을 올리는 곳이 아니라 "무엇을 붙여야 하는지" 목록이다
 * (파일 스토리지가 없어 업로드는 아직 못 한다). 체크는 문서에 남겨서
 * 결재자가 "첨부 확인했다"를 볼 수 있게 한다.
 */
export function AttachmentChecklist({
  docId,
  items,
  checked,
  editable,
}: {
  docId: string;
  items: string[];
  checked: number[];
  /** 상신 뒤에는 못 바꾼다 — 결재자가 본 상태가 흔들리면 안 된다 */
  editable: boolean;
}) {
  const [state, setState] = useState<number[]>(checked);
  const [, startTransition] = useTransition();

  const toggle = (i: number) => {
    const next = state.includes(i)
      ? state.filter((n) => n !== i)
      : [...state, i];
    setState(next); // 낙관적 반영 — 서버 왕복을 기다리면 체크가 늦게 켜진다
    startTransition(() => toggleGianAttachment(docId, next));
  };

  return (
    <div className={panel}>
      <h4 className={panelTitle}>
        첨부 체크리스트
        <span className="ml-1.5 font-mono font-normal">
          {state.length}/{items.length}
        </span>
      </h4>
      <ul className="space-y-1.5">
        {items.map((a, i) => (
          <li key={i}>
            <label
              className={`flex items-start gap-2 text-sm ${editable ? "cursor-pointer" : ""}`}
            >
              <input
                type="checkbox"
                checked={state.includes(i)}
                onChange={() => toggle(i)}
                disabled={!editable}
                className="mt-1 size-3.5 shrink-0 accent-[var(--gian-ok)]"
              />
              <span
                className={
                  state.includes(i) ? "text-[var(--gian-ink-soft)]" : ""
                }
              >
                {a}
              </span>
            </label>
          </li>
        ))}
      </ul>
      {editable && state.length < items.length && (
        <p className="mt-2 text-xs text-[var(--gian-ink-soft)]">
          서류는 결재 문서에 직접 붙여 주세요. 여기 체크는 빠뜨린 게 없는지
          확인용입니다.
        </p>
      )}
    </div>
  );
}
