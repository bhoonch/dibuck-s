"use client";

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import type { AgendaItem, MinutesAgenda } from "@/lib/minutes";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  generateMinutes,
  saveMinutesDraft,
  type GenerateMinutesState,
  type SaveMinutesState,
} from "../../actions";

/**
 * DECISIONS는 lib/minutes.ts(서버 전용 — node:crypto)에 있어 클라이언트가 값으로
 * import할 수 없다. select 옵션은 그 값을 그대로 옮겨 적은 것 — 늘리려면 여기와
 * lib/minutes.ts DECISIONS를 같이 고친다.
 */
const DECISION_OPTIONS = ["가결", "부결", "보류", "없음"] as const;

function blankAgenda(a: AgendaItem): MinutesAgenda {
  return {
    order: a.order,
    title: a.title,
    discussion: [],
    decision: "없음",
    votesFor: null,
    votesAgainst: null,
  };
}

/**
 * 위: 메모 붙여넣기 + [AI로 정리]. 아래: 안건별 편집 카드 + [저장].
 * LLM 없이도(aiReady=false여도) 아래 카드만으로 전부 손으로 채울 수 있다.
 */
export function MinutesEditor({
  docId,
  agenda,
  initialMinutes,
  initialRawText,
  aiReady,
}: {
  docId: string;
  agenda: AgendaItem[];
  initialMinutes?: MinutesAgenda[];
  initialRawText: string;
  aiReady: boolean;
}) {
  const [genState, genAction, genPending] = useActionState<
    GenerateMinutesState,
    FormData
  >(generateMinutes, undefined);

  const [draft, setDraft] = useState<MinutesAgenda[]>(() =>
    initialMinutes && initialMinutes.length === agenda.length
      ? initialMinutes
      : agenda.map(blankAgenda),
  );
  // AI 생성 결과가 오면 그걸로 갈아 끼운다 — 실패하거나 아직 안 눌렀으면 손 입력을 안 건드린다.
  // 렌더 중 이전 값과 비교해 반영(React 권장 패턴) — effect로 하면 불필요한 리렌더가 한 번 더 생긴다.
  // genState.agendas는 이미 서버(generateMinutes → normalizeMinutesAgendas)가
  // meta.agenda로 검증·정규화한 뒤 돌려준 값이다 — 여기서 다시 안건 개수·제목을
  // 맞춰 넣을 필요가 없다(앵커 위반 콘텐츠는 애초에 여기 도달하지 않는다).
  const [syncedGenState, setSyncedGenState] = useState(genState);
  if (genState !== syncedGenState) {
    setSyncedGenState(genState);
    if (genState && "agendas" in genState) setDraft(genState.agendas);
  }

  const [saveState, saveAction, savePending] = useActionState<
    SaveMinutesState,
    FormData
  >(saveMinutesDraft, undefined);

  const update = (i: number, patch: Partial<MinutesAgenda>) =>
    setDraft((prev) => prev.map((a, j) => (j === i ? { ...a, ...patch } : a)));

  return (
    <div className="space-y-5">
      <Card className="space-y-3 p-4 sm:p-6">
        <Label htmlFor="rawText">회의 메모</Label>
        <p className="text-xs text-muted-foreground">
          회의 중 적은 메모나 녹취를 옮긴 글을 그대로 붙여넣으세요.
          <br />
          안건별로 나눌 필요는 없습니다. 어느 안건 이야기인지는 AI가 나눕니다.
        </p>
        <form action={genAction} className="space-y-3">
          <input type="hidden" name="docId" value={docId} />
          <Textarea
            id="rawText"
            name="rawText"
            rows={8}
            defaultValue={initialRawText}
            placeholder="예: 승강기건 얘기함. 지금 업체가 3년째 하고 있는데 다들 만족한다고 함..."
          />
          {aiReady ? (
            <Button type="submit" disabled={genPending}>
              {genPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              AI로 정리
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">
              AI 초안은 준비 중입니다. 아래에서 직접 입력할 수 있습니다.
            </p>
          )}
          {genState && "error" in genState && (
            <p className="text-sm text-destructive">{genState.error}</p>
          )}
        </form>
      </Card>

      <form action={saveAction} className="space-y-4">
        <input type="hidden" name="docId" value={docId} />
        <input type="hidden" name="agendas" value={JSON.stringify(draft)} />
        {draft.map((a, i) => (
          <Card key={a.order} className="space-y-3 p-4 sm:p-6">
            <p className="text-sm font-semibold">
              {a.order}. {a.title}
            </p>
            <div>
              <Label htmlFor={`disc-${i}`}>논의 요지</Label>
              <p className="mb-1 text-xs text-muted-foreground">
                한 줄에 한 항목입니다.
              </p>
              <Textarea
                id={`disc-${i}`}
                rows={Math.max(3, a.discussion.length + 1)}
                value={a.discussion.join("\n")}
                onChange={(e) =>
                  update(i, { discussion: e.target.value.split("\n") })
                }
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor={`dec-${i}`}>의결 결과</Label>
                <Select
                  value={a.decision}
                  onValueChange={(v) =>
                    update(i, { decision: v as MinutesAgenda["decision"] })
                  }
                >
                  <SelectTrigger id={`dec-${i}`} className="mt-1.5 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DECISION_OPTIONS.map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor={`vf-${i}`}>찬성 수</Label>
                <Input
                  id={`vf-${i}`}
                  type="number"
                  min={0}
                  className="mt-1.5"
                  value={a.votesFor ?? ""}
                  onChange={(e) =>
                    update(i, {
                      votesFor:
                        e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
              </div>
              <div>
                <Label htmlFor={`va-${i}`}>반대 수</Label>
                <Input
                  id={`va-${i}`}
                  type="number"
                  min={0}
                  className="mt-1.5"
                  value={a.votesAgainst ?? ""}
                  onChange={(e) =>
                    update(i, {
                      votesAgainst:
                        e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
              </div>
            </div>
          </Card>
        ))}

        {saveState?.error && (
          <p className="text-sm text-destructive">{saveState.error}</p>
        )}
        <Button type="submit" size="lg" disabled={savePending}>
          {savePending ? <Loader2 className="size-4 animate-spin" /> : null}
          저장
        </Button>
      </form>
    </div>
  );
}
