import { Check } from "lucide-react";
import { stageLabels, won, type DunningStage } from "@/lib/dunning";
import { cn } from "@/lib/utils";
import { toggleEntryPaid } from "../actions";

export type EntryRow = {
  id: string;
  unit: string;
  name: string;
  amount: number;
  stage: number;
  paid: boolean;
};

/**
 * 세대 목록 + 납부 토글. 한 회차는 수십~수백 행이라 DataTable(검색·정렬·페이지)
 * 없이 단순 표 + 스크롤 컨테이너로 충분하다 — 서버 액션을 form action으로 쓰는 데는
 * 클라이언트 컴포넌트가 필요 없어 "use client"를 붙이지 않았다.
 */
export function EntriesTable({ rows }: { rows: EntryRow[] }) {
  return (
    <div className="max-h-[600px] overflow-y-auto rounded-xl border bg-card">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-gray-50 text-xs font-semibold tracking-wider text-gray-500 uppercase">
          <tr className="border-b border-gray-200">
            <th className="px-3 py-2 text-left">세대</th>
            <th className="px-3 py-2 text-left">이름</th>
            <th className="px-3 py-2 text-left">단계</th>
            <th className="px-3 py-2 text-right">미납액</th>
            <th className="px-3 py-2 text-center">납부 확인</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className={cn(
                "border-b border-gray-100 last:border-0",
                row.paid && "text-muted-foreground line-through",
              )}
            >
              <td className="px-3 py-2">{row.unit}</td>
              <td className="px-3 py-2">{row.name || "-"}</td>
              <td className="px-3 py-2">{stageLabels[row.stage as DunningStage]}</td>
              <td className="px-3 py-2 text-right font-mono">{won(row.amount)}</td>
              <td className="px-3 py-2 text-center">
                <form action={toggleEntryPaid} className="inline-flex">
                  <input type="hidden" name="id" value={row.id} />
                  <button
                    type="submit"
                    aria-pressed={row.paid}
                    aria-label={row.paid ? "납부 취소" : "납부 확인"}
                    className={cn(
                      "flex size-5 items-center justify-center rounded border",
                      row.paid
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-gray-300 hover:border-gray-400",
                    )}
                  >
                    {row.paid && <Check className="size-3.5" />}
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
