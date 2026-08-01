"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { stageLabels, won, type DunningStage } from "@/lib/dunning";
import { markEntryPaid } from "./actions";

export type UnpaidRow = {
  id: string;
  dong: string;
  ho: string;
  name: string | null;
  amount: number;
  stage: DunningStage;
  next: DunningStage;
  /** KST "YYYY-MM-DD" */
  lastSent: string;
  stale: boolean; // 마지막 발송 후 30일 경과
};

/**
 * 미납 중 세대 표 — 1차를 보낸 다음 걸음이 이 화면에 보여야 한다.
 * 체크한 세대만 골라 다음 단계 마법사로 넘기고(기본은 아무것도 안 고른 상태 —
 * 자동 전체 선택은 실수 발송의 씨앗이라는 사용자 피드백), 수납 확인도
 * 문서를 찾아 들어가지 않고 여기서 바로 처리한다.
 */
export function UnpaidTable({ rows }: { rows: UnpaidRow[] }) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const allChecked = rows.length > 0 && checked.size === rows.length;
  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const picked = rows.filter((r) => checked.has(r.id));
  const href = `/modules/dunning/new?units=${encodeURIComponent(
    picked.map((r) => `${r.dong}_${r.ho}`).join(","),
  )}`;

  const pay = (row: UnpaidRow) =>
    startTransition(async () => {
      const result = await markEntryPaid(row.id);
      if (result?.ok)
        toast.success(
          `${row.dong}동 ${row.ho}호를 납부 처리했습니다 — 발송 문서는 기록으로 남습니다.`,
        );
    });

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">미납 중 세대 {rows.length}</h2>
        {picked.length > 0 ? (
          <Button asChild variant="outline">
            <Link href={href}>선택한 {picked.length}세대 다음 단계 독촉장</Link>
          </Button>
        ) : (
          <Button variant="outline" disabled>
            보낼 세대를 선택하세요
          </Button>
        )}
      </div>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  aria-label="전체 선택"
                  checked={allChecked}
                  onChange={() =>
                    setChecked(
                      allChecked ? new Set() : new Set(rows.map((r) => r.id)),
                    )
                  }
                  className="size-4 accent-primary"
                />
              </TableHead>
              <TableHead>세대</TableHead>
              <TableHead>이름</TableHead>
              <TableHead>미납액</TableHead>
              <TableHead>마지막 발송</TableHead>
              <TableHead>다음 발송 시</TableHead>
              <TableHead className="w-24 text-center">수납</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <input
                    type="checkbox"
                    aria-label={`${r.dong}동 ${r.ho}호 선택`}
                    checked={checked.has(r.id)}
                    onChange={() => toggle(r.id)}
                    className="size-4 accent-primary"
                  />
                </TableCell>
                <TableCell className="font-medium">
                  {r.dong}동 {r.ho}호
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {r.name ?? "-"}
                </TableCell>
                <TableCell>{won(r.amount)}</TableCell>
                <TableCell className="text-muted-foreground">
                  {r.stage}차 {stageLabels[r.stage]} · {r.lastSent}
                  {r.stale && " (30일 지남)"}
                </TableCell>
                <TableCell>
                  {r.stage === 3 ? (
                    // 3차(내용증명)가 끝이다 — 그 뒤는 문서가 아니라 법적 절차
                    <span className="text-muted-foreground">
                      지급명령 검토 (3차 재발송 가능)
                    </span>
                  ) : (
                    `${r.next}차 ${stageLabels[r.next]}`
                  )}
                </TableCell>
                <TableCell className="text-center">
                  <ConfirmDialog
                    trigger={
                      <Button variant="outline" size="sm" disabled={pending}>
                        납부 확인
                      </Button>
                    }
                    title={`${r.dong}동 ${r.ho}호 납부를 확인했나요?`}
                    description={`미납액 ${won(r.amount)}이 수납된 것으로 표시하고 미납 목록에서 뺍니다. 발송한 독촉장 문서는 기록으로 남습니다. 되돌리려면 해당 문서에서 체크를 해제하세요.`}
                    confirmLabel="납부 확인"
                    onConfirm={() => pay(r)}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
