"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { stageLabels, won, type DunningStage } from "@/lib/dunning";

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
 * 체크한 세대만 골라 다음 단계 마법사로 넘긴다(전체가 아니라 일부만
 * 올리고 싶은 게 실무 기본값이라 체크박스가 필요하다 — 사용자 피드백).
 */
export function UnpaidTable({ rows }: { rows: UnpaidRow[] }) {
  const [checked, setChecked] = useState<Set<string>>(
    () => new Set(rows.map((r) => r.id)), // 기본 전체 선택 — 보통은 전부 보낸다
  );
  const allChecked = checked.size === rows.length;
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
            세대를 선택하세요
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
                  {r.next}차 {stageLabels[r.next]}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
