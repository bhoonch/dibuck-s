"use client";

import { useActionState, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import type { AgendaItem, MinutesAgenda, Quote, Speech, Votes } from "@/lib/minutes";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { TimeSelect } from "@/components/ui/time-select";
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

type Stance = "for" | "against" | "abstain";
const STANCE_LABEL: Record<Stance, string> = {
  for: "찬성",
  against: "반대",
  abstain: "기권",
};
const STANCE_STYLE: Record<Stance, string> = {
  for: "border-green-300 bg-green-50 text-green-800",
  against: "border-red-300 bg-red-50 text-red-800",
  abstain: "border-gray-300 bg-gray-100 text-gray-600",
};
const NEXT: Record<Stance, Stance> = {
  for: "against",
  against: "abstain",
  abstain: "for",
};

/** 표결 성명 배열 ↔ 이름별 입장 맵. 화면은 맵이 편하고 저장 형식은 배열이다 */
function stanceOf(votes: Votes | undefined, name: string): Stance {
  if (!votes) return "for";
  if (votes.against.includes(name)) return "against";
  if (votes.abstain.includes(name)) return "abstain";
  return "for";
}
function toVotes(names: string[], stance: (n: string) => Stance): Votes {
  return {
    for: names.filter((n) => stance(n) === "for"),
    against: names.filter((n) => stance(n) === "against"),
    abstain: names.filter((n) => stance(n) === "abstain"),
  };
}

/** 저장된 발언(레거시 string 포함)을 편집용 행으로 */
function toRows(discussion: (string | Speech)[]): Speech[] {
  return discussion.map((l) =>
    typeof l === "string" ? { speaker: "", text: l } : l,
  );
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
  present,
  required,
  members,
  initialClosedAt,
}: {
  docId: string;
  agenda: AgendaItem[];
  initialMinutes?: MinutesAgenda[];
  initialRawText: string;
  aiReady: boolean;
  /** 참석자 — 표결 칩과 발언자 후보. 서버가 meta.attendees에서 걸러 보낸다 */
  present: { name: string; label: string }[];
  /** 의결정족수(구성원 과반수). 회의 정보로 정해져 편집 중 바뀌지 않는다 */
  required: number;
  members: number;
  /** 폐회 시각 "HH:mm" — 회의가 끝나야 알 수 있어 소집이 아니라 여기서 받는다 */
  initialClosedAt: string;
}) {
  const [genState, genAction, genPending] = useActionState<
    GenerateMinutesState,
    FormData
  >(generateMinutes, undefined);

  /**
   * 의결이 있는데 표결이 비어 있으면 전원 찬성으로 채운다 — AI 초안과 votes 도입 전
   * 회의록이 여기로 들어온다. 채우지 않으면 화면은 "전원 찬성"을 보여주면서 저장은
   * 표결 없음으로 나가 둘이 어긋난다.
   */
  const withVoteDefaults = (list: MinutesAgenda[]) =>
    list.map((a) =>
      a.decision !== "없음" && !a.votes
        ? { ...a, votes: toVotes(present.map((p) => p.name), () => "for") }
        : a,
    );

  const [draft, setDraft] = useState<MinutesAgenda[]>(() =>
    withVoteDefaults(
      initialMinutes && initialMinutes.length === agenda.length
        ? initialMinutes
        : agenda.map(blankAgenda),
    ),
  );
  // AI 생성 결과가 오면 그걸로 갈아 끼운다 — 실패하거나 아직 안 눌렀으면 손 입력을 안 건드린다.
  // 렌더 중 이전 값과 비교해 반영(React 권장 패턴) — effect로 하면 불필요한 리렌더가 한 번 더 생긴다.
  // genState.agendas는 이미 서버(generateMinutes → normalizeMinutesAgendas)가
  // meta.agenda로 검증·정규화한 뒤 돌려준 값이다 — 여기서 다시 안건 개수·제목을
  // 맞춰 넣을 필요가 없다(앵커 위반 콘텐츠는 애초에 여기 도달하지 않는다).
  const [syncedGenState, setSyncedGenState] = useState(genState);
  if (genState !== syncedGenState) {
    setSyncedGenState(genState);
    if (genState && "agendas" in genState)
      setDraft(withVoteDefaults(genState.agendas));
  }

  const [saveState, saveAction, savePending] = useActionState<
    SaveMinutesState,
    FormData
  >(saveMinutesDraft, undefined);

  const presentNames = present.map((p) => p.name);

  // 갱신은 전부 setDraft의 함수형(prev)으로 한다 — 렌더 클로저의 draft를 읽으면
  // 리렌더 전에 연속으로 들어온 입력(빠른 타이핑·IME)이 같은 값을 덮어써 사라진다.
  const setRows = (i: number, fn: (rows: Speech[]) => Speech[]) =>
    setDraft((prev) =>
      prev.map((a, j) =>
        j === i ? { ...a, discussion: fn(toRows(a.discussion)) } : a,
      ),
    );
  const updateRow = (i: number, k: number, patch: Partial<Speech>) =>
    setRows(i, (rows) => rows.map((r, j) => (j === k ? { ...r, ...patch } : r)));
  const addRow = (i: number) =>
    setRows(i, (rows) => [...rows, { speaker: "", text: "" }]);
  const removeRow = (i: number, k: number) =>
    setRows(i, (rows) => rows.filter((_, j) => j !== k));

  /**
   * 의결 결과를 고르면 표결이 열린다 — 기본은 전원 찬성(실제로 반대·기권은 0~2명이라
   * 누르는 횟수가 가장 적다). "없음"(보고 안건)으로 되돌리면 표결을 지운다.
   * 이미 찍어둔 표결은 결과만 바꿔도 유지된다.
   */
  const setQuotes = (i: number, fn: (rows: Quote[]) => Quote[]) =>
    setDraft((prev) =>
      prev.map((a, j) =>
        j === i ? { ...a, quotes: fn(a.quotes ?? []) } : a,
      ),
    );
  const updateQuote = (i: number, k: number, patch: Partial<Quote>) =>
    setQuotes(i, (rows) => rows.map((r, j) => (j === k ? { ...r, ...patch } : r)));
  const addQuote = (i: number) =>
    setQuotes(i, (rows) => [...rows, { vendor: "", amount: null, note: "" }]);
  const removeQuote = (i: number, k: number) =>
    setQuotes(i, (rows) => rows.filter((_, j) => j !== k));

  const setDecision = (i: number, decision: MinutesAgenda["decision"]) =>
    setDraft((prev) =>
      prev.map((a, j) =>
        j !== i
          ? a
          : decision === "없음"
            ? { ...a, decision, votes: undefined }
            : {
                ...a,
                decision,
                votes: a.votes ?? toVotes(presentNames, () => "for"),
              },
      ),
    );

  const cycleVote = (i: number, name: string) =>
    setDraft((prev) =>
      prev.map((a, j) => {
        if (j !== i) return a;
        const next = NEXT[stanceOf(a.votes, name)];
        return {
          ...a,
          votes: toVotes(presentNames, (n) =>
            n === name ? next : stanceOf(a.votes, n),
          ),
        };
      }),
    );

  return (
    <div className="space-y-5">
      {/* 발언자 후보 — datalist라 목록에 없는 사람(배석자 등)도 그대로 적을 수 있다 */}
      <datalist id="speaker-options">
        {present.map((p) => (
          <option key={p.name} value={`${p.label} ${p.name}`} />
        ))}
      </datalist>

      <Card className="space-y-3 p-4 sm:p-6">
        <Label htmlFor="rawText">회의 메모</Label>
        <p className="text-xs text-muted-foreground">
          회의 중 적은 메모나 녹취를 옮긴 글을 그대로 붙여넣으세요.
          <br />
          안건별로 나눌 필요는 없습니다. 어느 안건 이야기인지는 AI가 나눕니다.
          <br />
          정리 결과는 메모에 적힌 만큼 나옵니다. AI는 메모에 없는 내용을 만들지
          않습니다.
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
            <>
              <Button type="submit" disabled={genPending}>
                {genPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : null}
                AI로 정리
              </Button>
              {genPending && (
                <p className="text-sm text-muted-foreground">
                  메모를 안건별로 나누고 있습니다. 잠시 걸립니다.
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              AI 초안은 준비 중입니다. 아래에서 직접 입력할 수 있습니다.
            </p>
          )}
          {genState && "error" in genState && (
            <p className="text-sm text-destructive">{genState.error}</p>
          )}
          {/* 성공 피드백 + 확인 필요 목록 — 서버가 돌려주는 needsClarification을 버리지 않는다 */}
          {!genPending && genState && "agendas" in genState && (
            <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
              <p>
                메모를 안건 {genState.agendas.length}개에 정리해 넣었습니다.
                아래에서 확인하고 수정하세요.
              </p>
              {genState.needsClarification.length > 0 && (
                <>
                  <p className="mt-2 font-semibold">확인이 필요한 항목</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5">
                    {genState.needsClarification.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </form>
      </Card>

      <form action={saveAction} className="space-y-4">
        <input type="hidden" name="docId" value={docId} />
        <input type="hidden" name="agendas" value={JSON.stringify(draft)} />

        <Card className="p-4 sm:p-6">
          <div className="max-w-[12rem]">
            <Label htmlFor="closedAt">폐회 시각</Label>
            <TimeSelect
              id="closedAt"
              name="closedAt"
              defaultValue={initialClosedAt}
              allowEmpty
            />
            <p className="mt-1 text-xs text-muted-foreground">
              회의록 서식의 회의일시에 개회 시각과 함께 인쇄됩니다.
            </p>
          </div>
        </Card>
        {draft.map((a, i) => (
          <Card key={a.order} className="space-y-3 p-4 sm:p-6">
            <p className="text-sm font-semibold">
              {a.order}. {a.title}
            </p>
            <div>
              <Label>발언 요지</Label>
              <p className="mb-1.5 text-xs text-muted-foreground">
                누가 말했는지 함께 적습니다.
                <br />
                관리규약이 발언자 성명 기록을 요구합니다.
              </p>
              <ul className="space-y-1.5">
                {toRows(a.discussion).map((sp, k) => (
                  <li key={k} className="flex items-center gap-2">
                    <Input
                      list="speaker-options"
                      value={sp.speaker}
                      onChange={(e) => updateRow(i, k, { speaker: e.target.value })}
                      placeholder="발언자"
                      className="h-9 w-36 shrink-0"
                      aria-label={`${a.order}번 안건 ${k + 1}번째 발언자`}
                    />
                    <Input
                      value={sp.text}
                      onChange={(e) => updateRow(i, k, { text: e.target.value })}
                      placeholder="발언 요지"
                      className="h-9 flex-1"
                      aria-label={`${a.order}번 안건 ${k + 1}번째 발언 요지`}
                    />
                    <button
                      type="button"
                      aria-label="발언 삭제"
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeRow(i, k)}
                    >
                      <X className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => addRow(i)}
              >
                <Plus className="size-4" /> 발언 추가
              </Button>
            </div>

            <div>
              <Label>견적 비교 (입찰 안건)</Label>
              <p className="mb-1.5 text-xs text-muted-foreground">
                사업자 선정 안건이면 응찰 업체와 금액을 적으세요.
                <br />
                회의록 심의 내용 안에 비교표로 인쇄됩니다.
              </p>
              {(a.quotes ?? []).length > 0 && (
                <ul className="space-y-1.5">
                  {(a.quotes ?? []).map((q, k) => (
                    <li key={k} className="flex items-center gap-2">
                      <Input
                        value={q.vendor}
                        onChange={(e) => updateQuote(i, k, { vendor: e.target.value })}
                        placeholder="업체명"
                        className="h-9 flex-1"
                        aria-label={`${a.order}번 안건 ${k + 1}번째 견적 업체명`}
                      />
                      <Input
                        type="number"
                        min={0}
                        value={q.amount ?? ""}
                        onChange={(e) =>
                          updateQuote(i, k, {
                            amount: e.target.value === "" ? null : Number(e.target.value),
                          })
                        }
                        placeholder="금액 (원)"
                        className="h-9 w-40 shrink-0"
                        aria-label={`${a.order}번 안건 ${k + 1}번째 견적 금액`}
                      />
                      <Input
                        value={q.note}
                        onChange={(e) => updateQuote(i, k, { note: e.target.value })}
                        placeholder="비고 (예: 최저가)"
                        className="h-9 w-40 shrink-0"
                        aria-label={`${a.order}번 안건 ${k + 1}번째 견적 비고`}
                      />
                      <button
                        type="button"
                        aria-label="견적 삭제"
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => removeQuote(i, k)}
                      >
                        <X className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => addQuote(i)}
              >
                <Plus className="size-4" /> 견적 추가
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor={`dec-${i}`}>의결 결과</Label>
                <Select
                  value={a.decision}
                  onValueChange={(v) => setDecision(i, v as MinutesAgenda["decision"])}
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
            </div>

            {a.decision !== "없음" && (
              <div>
                <Label>표결</Label>
                <p className="mb-1.5 text-xs text-muted-foreground">
                  기본은 전원 찬성입니다.
                  <br />
                  이름을 누르면 찬성 → 반대 → 기권 순으로 바뀝니다.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {present.map((pa) => {
                    const st = stanceOf(a.votes, pa.name);
                    return (
                      <button
                        key={pa.name}
                        type="button"
                        onClick={() => cycleVote(i, pa.name)}
                        className={`rounded-full border px-3 py-1 text-sm ${STANCE_STYLE[st]}`}
                      >
                        {pa.name}{" "}
                        <span className="font-semibold">{STANCE_LABEL[st]}</span>
                      </button>
                    );
                  })}
                  {present.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      참석자가 없어 표결을 기록할 수 없습니다.
                    </p>
                  )}
                </div>
                {(() => {
                  const v = a.votes ?? toVotes(presentNames, () => "for");
                  const short = a.decision === "가결" && v.for.length < required;
                  return (
                    <>
                      <p className="mt-2 text-sm">
                        찬성 {v.for.length} · 반대 {v.against.length} · 기권{" "}
                        {v.abstain.length}
                        <span className="text-muted-foreground">
                          {"  "}(구성원 {members}명, 의결정족수 {required}명)
                        </span>
                      </p>
                      {short && (
                        <p className="mt-1 text-sm font-semibold text-red-600">
                          찬성 {v.for.length}명은 의결정족수 {required}명에
                          미달합니다.
                          <br />
                          관리규약이 이 안건에 정한 정족수를 확인하세요.
                        </p>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
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
