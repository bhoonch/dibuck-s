"use client";

import { useState, useTransition } from "react";
import { setResolutionStatus } from "../actions";

/** followupStatus별 pill 색 — 기한 경과(overdue)면 이행중이어도 빨강으로 덮는다 */
const styles: Record<string, string> = {
  없음: "bg-gray-100 text-gray-600",
  이행중: "bg-amber-50 text-amber-700",
  완료: "bg-green-50 text-green-700",
};

/** 대장 행 안 한 클릭 상태 변경 — select 자체가 pill처럼 보이게 꾸민다 */
export function StatusSelect({
  id,
  status,
  overdue,
  options,
}: {
  id: string;
  status: string;
  overdue: boolean;
  options: readonly string[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <div>
      <select
        aria-label="후속 조치 상태"
        value={status}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value as "없음" | "이행중" | "완료";
          startTransition(async () => {
            const r = await setResolutionStatus(id, next);
            setError(r && "error" in r ? r.error : undefined);
          });
        }}
        className={`rounded-full border-0 px-2 py-0.5 text-xs font-medium ${
          overdue ? "bg-red-50 text-red-700" : (styles[status] ?? "bg-gray-100 text-gray-600")
        }`}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}
