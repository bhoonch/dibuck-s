/**
 * 기안·품의 진행 단계 표시 — 목업의 `.steps` 구성.
 * 입력 → 초안 확인 → 결재. 글자 크기는 공용 체계(text-sm/text-xs).
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
              className={`grid size-6 place-items-center rounded-full border text-xs font-bold ${
                i + 1 === current
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-[var(--gian-line-strong)] bg-[var(--gian-card)] text-[var(--gian-ink-soft)]"
              }`}
            >
              {i + 1}
            </span>
            <span
              className={`text-sm ${
                i + 1 === current
                  ? "font-bold text-foreground"
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
