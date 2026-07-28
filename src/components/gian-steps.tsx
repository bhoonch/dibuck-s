import Link from "next/link";

/**
 * 기안·품의 진행 단계 표시 — 목업의 `.steps` 구성.
 * 입력 → 초안 확인 → 결재. 글자 크기는 공용 체계(text-sm/text-xs).
 *
 * 되돌아갈 수 있는 단계만 링크가 된다(`editHref`). 결재가 시작된 뒤에는
 * 결재자가 본 내용이 바뀌면 안 되므로 아무 단계도 눌리지 않는다 —
 * 눌러지게 생긴 것이 안 눌리는 게 제일 나쁘다.
 */
const LABELS = ["문서 정보 입력", "초안 확인", "결재"];

export function GianSteps({
  current,
  editHref,
}: {
  current: 1 | 2 | 3;
  /** 1단계(내용 수정)로 돌아갈 수 있을 때만 준다 — 작성 중·반려 문서 */
  editHref?: string;
}) {
  return (
    <div className="mb-5 flex items-center print:hidden">
      {LABELS.map((label, i) => {
        const active = i + 1 === current;
        const inner = (
          <>
            <span
              className={`grid size-6 place-items-center rounded-full border text-xs font-bold ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-[var(--gian-line-strong)] bg-[var(--gian-card)] text-[var(--gian-ink-soft)]"
              }`}
            >
              {i + 1}
            </span>
            <span
              className={`text-sm ${
                active
                  ? "font-bold text-foreground"
                  : "text-[var(--gian-ink-soft)]"
              }`}
            >
              {label}
            </span>
          </>
        );
        return (
          <div key={label} className="flex items-center">
            {i > 0 && (
              <span className="mx-3 h-px w-11 bg-[var(--gian-line-strong)]" />
            )}
            {i === 0 && editHref ? (
              <Link
                href={editHref}
                title="문서 내용을 다시 고칩니다"
                className="flex items-center gap-2.5 rounded-md px-1.5 py-1 -mx-1.5 transition-colors hover:bg-muted"
              >
                {inner}
              </Link>
            ) : (
              <div className="flex items-center gap-2.5">{inner}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
