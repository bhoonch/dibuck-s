"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { stageLabels, won, type DunningStage } from "@/lib/dunning";
import { cn } from "@/lib/utils";
import { savePaidEntries, voidDunningBatch } from "../actions";

export type EntryRow = {
  id: string;
  unit: string; // "101동 502호"
  name: string;
  amount: number;
  stage: DunningStage;
  paid: boolean;
  /** 왼쪽 용지 더미에서 이 세대 장의 앵커 id */
  sheetId: string;
};

/**
 * 세대 목록 + 납부 확인. 320px 칸에서 5칸 표는 줄바꿈으로 깨져서(사용자 지적)
 * 세대·이름을 첫 줄, 단계·금액을 둘째 줄에 놓는 2줄 목록으로 그린다.
 * 납부 확인은 체크 즉시 저장하지 않고 [저장]으로 모아 반영한다 —
 * 자동 저장은 "저장이 안 된 것 같다"는 불안을 만들었다(사용자 피드백).
 */
export function EntriesPanel({
  docId,
  rows,
  voided,
  canVoid,
}: {
  docId: string;
  rows: EntryRow[];
  voided: boolean;
  canVoid: boolean;
}) {
  const [paid, setPaid] = useState<Set<string>>(
    () => new Set(rows.filter((r) => r.paid).map((r) => r.id)),
  );
  const [saved, setSaved] = useState(paid);
  const [pending, startTransition] = useTransition();
  const dirty =
    paid.size !== saved.size || [...paid].some((id) => !saved.has(id));

  const toggle = (id: string) =>
    setPaid((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const save = () =>
    startTransition(async () => {
      const result = await savePaidEntries(docId, [...paid]);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      setSaved(new Set(paid));
      toast.success("납부 확인을 저장했습니다.");
    });

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <b className="text-sm">
          세대 {rows.length}
          {paid.size > 0 && (
            <span className="ml-1.5 font-normal text-muted-foreground">
              · 납부 {paid.size}
            </span>
          )}
        </b>
        {!voided && (
          <div className="flex items-center gap-2">
            {dirty && (
              <span className="text-xs text-muted-foreground">저장 안 됨</span>
            )}
            <Button size="sm" onClick={save} disabled={pending || !dirty}>
              {pending ? "저장 중..." : "저장"}
            </Button>
          </div>
        )}
      </div>

      <ul className="max-h-[560px] overflow-y-auto">
        {rows.map((row) => {
          const isPaid = paid.has(row.id);
          return (
            <li
              key={row.id}
              className="flex items-start gap-2.5 border-b border-gray-100 px-4 py-2.5 last:border-0"
            >
              {!voided && (
                <input
                  type="checkbox"
                  aria-label={`${row.unit} 납부 확인`}
                  checked={isPaid}
                  onChange={() => toggle(row.id)}
                  className="mt-0.5 size-4 accent-primary"
                />
              )}
              <div className={cn("min-w-0 flex-1", isPaid && "text-muted-foreground line-through")}>
                {/* 클릭 = 왼쪽 용지 더미에서 이 세대 장으로 이동 */}
                <a href={`#${row.sheetId}`} className="block truncate text-sm font-medium hover:underline">
                  {row.unit}
                  {row.name && <span className="font-normal"> {row.name}</span>}
                </a>
                <p className="mt-0.5 flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
                  <span>
                    {row.stage}차 {stageLabels[row.stage]}
                  </span>
                  <span className="font-mono">{won(row.amount)}</span>
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      {/* 되돌릴 수 없는 일은 오른쪽 첫 카드 하단 — 인쇄 버튼 무리에 섞지 않는다 */}
      {canVoid && !voided && (
        <div className="border-t border-gray-100 px-4 py-3">
          <ConfirmDialog
            trigger={
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive"
                disabled={pending}
              >
                독촉장 폐기
              </Button>
            }
            title="이 독촉장을 폐기할까요?"
            description="세대·금액을 잘못 넣고 만들었을 때 취소하는 기능입니다. 문서는 삭제되지 않고 문서함에 '폐기'로 남아 열람만 되며, 이 발송 건은 미납 집계와 다음 단계 제안에서 빠집니다."
            confirmLabel="폐기"
            destructive
            onConfirm={() =>
              startTransition(async () => {
                const r = await voidDunningBatch(docId);
                if (r?.error) toast.error(r.error);
              })
            }
          />
        </div>
      )}
    </div>
  );
}
