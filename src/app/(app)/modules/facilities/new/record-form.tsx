"use client";

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createInspectionRecord, type RecordState } from "../actions";

type ItemOption = {
  id: string;
  name: string;
  vendor: string;
  /** YYYY-MM-DD, 없으면 "" */
  lastDoneAt: string;
};

const selectCls =
  "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm";

/**
 * 기록 작성 — 기본값 전부 채워진 채 시작한다(실시일=오늘, 수행=항목 업체).
 * 소장이 타이핑할 것은 지적사항이 있을 때의 내용뿐이다.
 */
export function RecordForm({
  items,
  preselect,
  today,
}: {
  items: ItemOption[];
  preselect?: string;
  today: string;
}) {
  const [state, formAction, pending] = useActionState<RecordState, FormData>(
    createInspectionRecord,
    undefined,
  );
  const [itemId, setItemId] = useState(
    preselect && items.some((it) => it.id === preselect) ? preselect : items[0].id,
  );
  const [result, setResult] = useState<"정상" | "지적사항">("정상");
  const item = items.find((it) => it.id === itemId)!;

  return (
    <form action={formAction}>
      <Card className="space-y-4 p-6">
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="itemId">
            점검 항목
          </label>
          <select
            id="itemId"
            name="itemId"
            value={itemId}
            onChange={(e) => setItemId(e.target.value)}
            className={selectCls}
          >
            {items.map((it) => (
              <option key={it.id} value={it.id}>
                {it.name}
              </option>
            ))}
          </select>
          {item.lastDoneAt && (
            <p className="mt-1 text-xs text-muted-foreground">
              마지막 실시 {item.lastDoneAt} — 저장하면 이 날짜가 갱신됩니다.
            </p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="doneAt">
              실시일자
            </label>
            <Input id="doneAt" name="doneAt" type="date" defaultValue={today} required />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="performedBy">
              수행 (자체 또는 업체·기관명)
            </label>
            {/* 항목을 바꾸면 업체 기본값도 바뀌어야 하므로 key로 리마운트 */}
            <Input
              key={itemId}
              id="performedBy"
              name="performedBy"
              defaultValue={item.vendor || "자체"}
            />
          </div>
        </div>

        <div>
          <span className="mb-1 block text-sm font-medium">결과</span>
          <div className="flex gap-4">
            {(["정상", "지적사항"] as const).map((r) => (
              <label key={r} className="flex cursor-pointer items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  name="result"
                  value={r}
                  checked={result === r}
                  onChange={() => setResult(r)}
                  className="size-4 accent-blue-700"
                />
                {r}
              </label>
            ))}
          </div>
        </div>

        {result === "지적사항" && (
          <>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="findings">
                지적 내용
              </label>
              <Textarea
                id="findings"
                name="findings"
                rows={3}
                placeholder={"한 줄에 하나씩 적어 주세요.\n예) 지하 1층 소화전 표시등 불량"}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="actions">
                조치 계획
              </label>
              <Textarea
                id="actions"
                name="actions"
                rows={3}
                placeholder={"예) 표시등 교체 — 8월 중 업체 발주"}
              />
            </div>
          </>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="cost">
            비용 (선택, 원)
          </label>
          <Input id="cost" name="cost" inputMode="numeric" placeholder="예: 350,000" className="w-48" />
        </div>

        {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
        <div className="flex items-center gap-3">
          <Button type="submit" size="lg" disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            기록 저장
          </Button>
          <span className="text-xs text-muted-foreground">
            성적서·검사필증은 저장 후 문서 화면에서 첨부할 수 있습니다.
          </span>
        </div>
      </Card>
    </form>
  );
}
