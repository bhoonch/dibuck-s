"use client";

import { useState, useTransition } from "react";
import { panel, panelTitle } from "@/components/gian-ui";
import { toggleGianAttachment } from "../approval-actions";

/**
 * 첨부 체크리스트 — 파일이 없는 서류(사업자등록증·시방서 등)의 확인 수단.
 * 견적서는 실물 파일이 검증하므로 호출부가 목록에서 뺀다 — 그래서 항목이
 * 원본 붙임 목록의 번호(idx)를 들고 다닌다(체크 저장은 원본 번호 기준).
 * 체크는 문서에 남겨서 결재자가 "첨부 확인했다"를 볼 수 있게 한다.
 */
export function AttachmentChecklist({
  docId,
  items,
  checked,
  editable,
}: {
  docId: string;
  items: { idx: number; label: string }[];
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

  const done = items.filter((it) => state.includes(it.idx)).length;

  return (
    <div className={panel}>
      <h4 className={panelTitle}>
        첨부 체크리스트
        <span className="ml-1.5 font-mono font-normal">
          {done}/{items.length}
        </span>
      </h4>
      <ul className="space-y-1.5">
        {items.map((it) => (
          <li key={it.idx}>
            <label
              className={`flex items-start gap-2 text-sm ${editable ? "cursor-pointer" : ""}`}
            >
              <input
                type="checkbox"
                checked={state.includes(it.idx)}
                onChange={() => toggle(it.idx)}
                disabled={!editable}
                className="mt-1 size-3.5 shrink-0 accent-[var(--gian-ok)]"
              />
              <span
                className={
                  state.includes(it.idx) ? "text-[var(--gian-ink-soft)]" : ""
                }
              >
                {it.label}
              </span>
            </label>
          </li>
        ))}
      </ul>
      {editable && done < items.length && (
        <p className="mt-2 text-xs text-[var(--gian-ink-soft)]">
          파일로 낼 서류는 위 &lsquo;첨부파일&rsquo;에 올려 주세요. 여기 체크는
          빠뜨린 서류가 없는지 확인용입니다.
        </p>
      )}
    </div>
  );
}
