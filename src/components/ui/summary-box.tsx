/**
 * 저장된 값을 폼·표 **위에** 먼저 보여주는 회색 박스.
 * 값이 입력칸 안에만 있으면 placeholder(예시)와 저장값이 같은 회색 글씨로 보여 구분이 안 되고,
 * 표만 있으면 "지금 몇 건이 어떤 상태인지"를 세어 봐야 안다.
 */
export function SummaryBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-muted/50 px-4 py-3.5 text-sm">
      {children}
    </div>
  );
}

/** SummaryBox 안의 수치 한 칸 — 설정 첫 화면 타일과 같은 위계(라벨·값·보조설명) */
export function SummaryStat({
  label,
  value,
  note,
}: {
  label: string;
  value: React.ReactNode;
  note?: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold tracking-wider text-gray-400 uppercase">
        {label}
      </dt>
      <dd className="font-mono text-xl leading-tight font-semibold tracking-tight">
        {value}
      </dd>
      {note && <dd className="mt-0.5 text-xs text-muted-foreground">{note}</dd>}
    </div>
  );
}
