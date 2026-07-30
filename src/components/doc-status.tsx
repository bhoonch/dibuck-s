import { docStatusLabels, docStatusStyles } from "@/lib/labels";

/**
 * 문서 상태 칸 — 배지 + "누구 차례" 한 줄.
 * 기안 목록과 문서함이 같은 문법을 쓰도록 한 곳에 둔다.
 * 배지 안에 이름을 합치지 않는 이유: 이름 길이에 따라 배지 폭이 달라져 상태 열이 들쭉날쭉해진다.
 */
export function StatusCell({
  status,
  waitingOn,
}: {
  status: string;
  /** 지금 결재 차례인 사람 — 결재 중이 아니면 null */
  waitingOn?: string | null;
}) {
  return (
    <div>
      <span
        className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${docStatusStyles[status] ?? "bg-gray-100 text-gray-600"}`}
      >
        {docStatusLabels[status] ?? status}
      </span>
      {/* 배지가 이미 "결재 대기"라고 말하니 아래줄은 누구인지만 가리킨다 */}
      {waitingOn && (
        <span className="mt-0.5 block text-xs text-gray-500">→ {waitingOn}</span>
      )}
    </div>
  );
}
