/**
 * 기안·품의 진행 단계 표시 — 목업의 `.steps`.
 * 입력 → 초안 확인 → 결재. 현재 단계만 진하게(navy) 칠한다.
 */
const LABELS = ["문서 정보 입력", "초안 확인", "결재"];

export function GianSteps({ current }: { current: 1 | 2 | 3 }) {
  return (
    <div className="mb-5 flex items-center print:hidden">
      {LABELS.map((label, i) => (
        <div key={label} className="flex items-center">
          {i > 0 && (
            <span className="mx-3 h-px w-11 bg-[var(--gian-line-strong)]" />
          )}
          <div className="flex items-center gap-2.5">
            <span
              className={`grid size-6 place-items-center rounded-full text-[12.5px] font-bold ${
                i + 1 === current
                  ? "border-[1.5px] border-[var(--gian-navy)] bg-[var(--gian-navy)] text-[var(--gian-paper)]"
                  : "border-[1.5px] border-[var(--gian-line-strong)] bg-[var(--gian-card)] text-[var(--gian-ink-soft)]"
              }`}
            >
              {i + 1}
            </span>
            <span
              className={`text-[13.5px] ${
                i + 1 === current
                  ? "font-bold text-[var(--gian-ink)]"
                  : "text-[var(--gian-ink-soft)]"
              }`}
            >
              {label}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
