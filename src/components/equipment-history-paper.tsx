import type { RepairStat } from "@/lib/repairs";

export type HistoryPaperRecord = {
  /** 없으면 이관 기록 — "이관"으로 표기 */
  docNo: string | null;
  startedAt: string;
  symptom: string;
  action: string;
  vendor: string;
  cost: number;
  /** open = 조치 중 — 비고 열에 표기 */
  status: string;
};

const won = (n: number) => (n > 0 ? `${n.toLocaleString("ko-KR")}원` : "-");

const cellCls = "border border-[var(--gian-doc-line)] px-2 py-1 align-top";

/**
 * A4 설비 이력 카드 — 인수인계 출력물. 기안서 축(본문 11.5pt, 괘선).
 * 이력이 길면 여러 장이 정상이고, 쪽 나눔이 표 행 중간을 자르지 않아야 한다
 * (tr break-inside-avoid + thead는 인쇄에서 쪽마다 자동 반복).
 */
export function EquipmentHistoryPaper({
  office,
  equipment,
  stat,
  records,
  printedAt,
}: {
  office: string;
  equipment: {
    name: string;
    category: string;
    location: string;
    installedAt: string;
    vendor: string;
    active: boolean;
  };
  stat: RepairStat;
  /** 시간 역순 */
  records: HistoryPaperRecord[];
  printedAt: string;
}) {
  const info: [string, string][] = [
    ["설 비 명", equipment.name],
    ["분　　류", equipment.category],
    ["위　　치", equipment.location || "-"],
    ["설치·교체 시점", equipment.installedAt || "-"],
    ["담당 업체", equipment.vendor || "-"],
    ["상　　태", equipment.active ? "사용 중" : "비활성 (폐기·교체됨)"],
  ];

  return (
    <article
      id="a4-sheet"
      className="w-full max-w-[210mm] bg-[var(--gian-card)] px-[16mm] py-[14mm] text-[11.5pt] leading-[1.6] text-[var(--gian-ink)] shadow-[var(--gian-shadow)] [border:1.5px_solid_var(--gian-doc-line)] lg:w-[210mm] print:border-0 print:p-0 print:shadow-none"
    >
      <h1 className="text-center text-[16pt] font-bold tracking-[0.3em]">
        설비 이력 카드
      </h1>

      <table className="mt-[6mm] w-full border-collapse">
        <tbody>
          {info.map(([k, v]) => (
            <tr key={k}>
              <th
                className={`${cellCls} w-[34mm] bg-[var(--gian-paper)] text-left text-[10pt] font-semibold whitespace-nowrap`}
              >
                {k}
              </th>
              <td className={cellCls}>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="mt-[4mm] text-[10.5pt]">
        최근 12개월 수선 <b>{stat.count12m}회</b> · 누계{" "}
        <b>{won(stat.cost12m)}</b>
        <span className="mx-2 text-[var(--gian-ink-soft)]">|</span>
        전체 기간 <b>{stat.countAll}회</b> · 누계 <b>{won(stat.costAll)}</b>
      </p>

      <table className="mt-[4mm] w-full border-collapse text-[10pt]">
        <thead>
          <tr>
            {["일자", "문서번호", "증상", "조치", "업체", "비용"].map((h) => (
              <th
                key={h}
                className={`${cellCls} bg-[var(--gian-paper)] text-center font-semibold whitespace-nowrap`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.map((r, i) => (
            <tr key={i} className="break-inside-avoid">
              <td className={`${cellCls} whitespace-nowrap`}>{r.startedAt}</td>
              <td className={`${cellCls} whitespace-nowrap`}>
                {r.docNo ?? "이관"}
              </td>
              <td className={cellCls}>
                {r.symptom}
                {r.status === "open" ? " (조치 중)" : ""}
              </td>
              <td className={cellCls}>{r.action || "-"}</td>
              <td className={cellCls}>{r.vendor || "-"}</td>
              <td
                className={`${cellCls} text-right whitespace-nowrap tabular-nums`}
              >
                {won(r.cost)}
              </td>
            </tr>
          ))}
          {records.length === 0 && (
            <tr>
              <td className={`${cellCls} text-center`} colSpan={6}>
                수선 이력이 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <p className="mt-[6mm] text-[9.5pt] text-[var(--gian-ink-soft)]">
        출력일 {printedAt} · {office}
        <br />본 이력은 디벅 문서함에 원본이 보관되어 있습니다.
      </p>
    </article>
  );
}
