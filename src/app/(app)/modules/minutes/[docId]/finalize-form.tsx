"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import type { MinutesAgenda } from "@/lib/minutes";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { finalizeMinutes } from "../actions";

/**
 * lib/minutes.ts FOLLOWUPS는 서버 전용(node:crypto) — 값만 옮겨 적는다.
 * "완료"는 여기서 고르지 않는다: 방금 의결된 안건이 이 화면에서 이미 완료 상태일 리 없다.
 */
const FOLLOWUP_OPTIONS = ["없음", "이행중"] as const;

type Row = {
  order: number;
  title: string;
  decision: string;
  included: boolean;
  followupStatus: (typeof FOLLOWUP_OPTIONS)[number];
  dueDate: string;
  note: string;
};

/**
 * 회의록 완성 확인 UI — LLM·손 입력이 만든 초안이 무확인으로 DB(Resolution)에
 * 들어가지 않게, decision이 "없음"이 아닌 안건만 후보로 프리필하고 사용자가
 * 등록 여부를 한 번 더 확인해야 넘어간다. 등록 체크를 끄면 그 안건은 회의록
 * 본문에는 남지만 Resolution으로는 만들어지지 않는다(후속 조치 추적 대상이 아니게 된다).
 */
export function FinalizeForm({
  docId,
  agendas,
}: {
  docId: string;
  agendas: MinutesAgenda[];
}) {
  const candidates = agendas.filter((a) => a.decision !== "없음");
  const [rows, setRows] = useState<Row[]>(() =>
    candidates.map((a) => ({
      order: a.order,
      title: a.title,
      decision: a.decision,
      included: true,
      followupStatus: "없음",
      dueDate: "",
      note: "",
    })),
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  const update = (order: number, patch: Partial<Row>) =>
    setRows((prev) =>
      prev.map((r) => (r.order === order ? { ...r, ...patch } : r)),
    );

  const submit = () =>
    startTransition(async () => {
      const resolutions = rows
        .filter((r) => r.included)
        .map((r) => ({
          order: r.order,
          title: r.title,
          decision: r.decision,
          followupStatus: r.followupStatus,
          dueDate: r.dueDate || null,
          note: r.note,
        }));
      const result = await finalizeMinutes(docId, resolutions);
      if (result && "error" in result && result.error) setError(result.error);
    });

  return (
    <Card className="space-y-4 p-4 sm:p-6">
      <div>
        <h4 className="text-sm font-semibold">회의록 완성</h4>
        <p className="mt-1 text-sm text-muted-foreground">
          확인된 의결만 등록됩니다.
          <br />
          회의록 완성 후 회의록은 수정할 수 없습니다.
        </p>
      </div>

      {candidates.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          등록할 의결사항이 없습니다. 그대로 완성할 수 있습니다.
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div
              key={r.order}
              className="space-y-2 rounded-md border border-[var(--gian-line)] p-3"
            >
              <label className="flex items-start gap-2">
                <Checkbox
                  checked={r.included}
                  onCheckedChange={(v) =>
                    update(r.order, { included: v === true })
                  }
                  className="mt-0.5"
                />
                <span className="text-sm font-medium">
                  {r.order}. {r.title}
                  <span className="ml-1.5 font-normal text-muted-foreground">
                    ({r.decision})
                  </span>
                </span>
              </label>
              {r.included && (
                <div className="grid gap-2 pl-6 sm:grid-cols-3">
                  <div>
                    <Label htmlFor={`fu-${r.order}`} className="text-xs">
                      후속 조치
                    </Label>
                    <Select
                      value={r.followupStatus}
                      onValueChange={(v) =>
                        update(r.order, {
                          followupStatus: v as Row["followupStatus"],
                        })
                      }
                    >
                      <SelectTrigger id={`fu-${r.order}`} className="mt-1 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FOLLOWUP_OPTIONS.map((f) => (
                          <SelectItem key={f} value={f}>
                            {f}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor={`due-${r.order}`} className="text-xs">
                      기한 (선택)
                    </Label>
                    <Input
                      id={`due-${r.order}`}
                      type="date"
                      className="mt-1"
                      value={r.dueDate}
                      onChange={(e) =>
                        update(r.order, { dueDate: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor={`note-${r.order}`} className="text-xs">
                      비고 (선택)
                    </Label>
                    <Textarea
                      id={`note-${r.order}`}
                      rows={1}
                      className="mt-1"
                      value={r.note}
                      onChange={(e) => update(r.order, { note: e.target.value })}
                    />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button size="lg" disabled={pending} onClick={submit}>
        {pending && <Loader2 className="size-4 animate-spin" />} 회의록 완성
      </Button>
    </Card>
  );
}
