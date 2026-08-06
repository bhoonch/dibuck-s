"use client";

import { useActionState, useRef, useState } from "react";
import {
  AlertTriangle,
  Camera,
  ChevronLeft,
  FileText,
  Loader2,
  Paperclip,
  Plus,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PaperScale } from "@/components/paper-scale";
import { InspectionPaper } from "@/components/inspection-paper";
import { STATUS_PILL, toneOf } from "@/lib/inspection/status";
import {
  followupOf,
  type InspectionStatus,
} from "@/lib/inspection/schedule";
import { RESULT_HINT, needsFindings, worstResult } from "@/lib/inspection/catalog";
import {
  createInspectionRecord,
  saveInspectionRecord,
  type RecordState,
} from "../actions";

/** 놀이기구 한 대의 판정 — 놀이시설 항목에서만 쓴다 */
export type Unit = { name: string; result: string };

type ItemOption = {
  id: string;
  name: string;
  legalBasis: string;
  vendor: string;
  /** YYYY-MM-DD, 없으면 "" */
  lastDoneAt: string;
  cycle: string;
  status: InspectionStatus;
  /** 도래일까지 남은 일수 — 앵커 없으면 null */
  left: number | null;
  /** 이 항목이 쓰는 판정어 — 놀이시설만 4단계 */
  resultChoices: string[];
  /** 기구별 판정을 받는가(놀이시설). 직전 기록의 기구 목록이 초기값으로 온다 */
  units: string[] | null;
  /** 법이 정한 점검 범위 문구 — 일지 하단에 찍는다. 없으면 "" */
  scope: string;
};

/** 수정 모드 — 항목은 고정, 파일은 문서 화면의 첨부 패널이 담당한다 */
export type EditDefaults = {
  docId: string;
  docNo: string;
  doneAt: string;
  performedBy: string;
  result: string;
  findings: string;
  actions: string;
  cost: number;
  units: Unit[];
  barrier: boolean;
  /** 이미 붙어 있는 첨부 이름 — 미리보기 첨부 목록용 */
  attachmentNames: string[];
};

/**
 * 폰으로 찍은 성적서(5MB급)를 담기 전에 줄인다 — 장변 2000px WebP
 * (quote-files.tsx와 같은 방식). 실패하면 원본 — 서버 3MB 상한이 최종선이다.
 */
async function shrinkImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
  if (scale === 1 && file.size < 500 * 1024) return file;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((res) =>
    canvas.toBlob(res, "image/webp", 0.8),
  );
  if (!blob) return file;
  return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".webp", {
    type: "image/webp",
  });
}

const kb = (n: number) => `${Math.max(1, Math.round(n / 1024))}KB`;

/** 판정어의 뜻 — 오른쪽 열(lg+)과 폰의 접이식이 같은 문장을 쓴다 */
function ResultLegend({
  choices,
  className = "",
}: {
  choices: string[];
  className?: string;
}) {
  const rows = choices.filter((c) => RESULT_HINT[c]);
  if (rows.length === 0) return null;
  return (
    <dl className={`space-y-1 text-xs text-muted-foreground ${className}`}>
      {rows.map((c) => (
        <div key={c} className="flex gap-1.5">
          <dt className="shrink-0 font-medium text-foreground">{c}</dt>
          <dd>{RESULT_HINT[c]}</dd>
        </div>
      ))}
    </dl>
  );
}

/** 항목이 기구별 판정을 받으면 직전 기록의 기구 목록을 그대로 깔아 준다 — 다음 달엔 탭만 */
const unitsFrom = (o?: ItemOption): Unit[] =>
  o?.units ? o.units.map((name) => ({ name, result: o.resultChoices[0] })) : [];

/** 카드의 D-day 문구 — 지연은 지난 일수로 말한다 */
const dueText = (o: ItemOption) =>
  o.left === null
    ? "실시일 없음"
    : o.left < 0
      ? `${-o.left}일 지남`
      : `D-${o.left}`;

/**
 * 기록 작성·수정 폼 — 2단계(시안 B) + 라이브 A4 미리보기(시안 C).
 * ① 항목 카드에서 고른다(급한 것부터, 현황판 정렬 그대로) →
 * ② 입력하는 대로 오른쪽 A4 점검일지가 채워진다 — 저장 전에 결과물을 본다.
 * 필드가 전부 제어 상태인 이유가 이 미리보기다.
 */
export function RecordForm({
  items,
  preselect,
  today,
  office,
  author,
  edit,
}: {
  items: ItemOption[];
  preselect?: string;
  today: string;
  /** A4 하단 확인란 명의 (예: "행복아파트 관리사무소장") */
  office: string;
  /** A4 작성자 줄 — 저장 시 작성자가 되는 현재 사용자 */
  author: string;
  edit?: EditDefaults;
}) {
  const [state, formAction, pending] = useActionState<RecordState, FormData>(
    edit ? saveInspectionRecord : createInspectionRecord,
    undefined,
  );
  // ① 항목 선택 — preselect(현황판 [기록] 버튼)나 수정 모드는 바로 ②로
  const initialId = edit
    ? items[0].id
    : preselect && items.some((it) => it.id === preselect)
      ? preselect
      : null;
  const [itemId, setItemId] = useState<string | null>(initialId);
  const item = items.find((it) => it.id === itemId);

  // ② 입력값 — 미리보기가 실시간으로 읽는다
  const initial = items.find((it) => it.id === initialId);
  const [doneAt, setDoneAt] = useState(edit?.doneAt ?? today);
  const [performedBy, setPerformedBy] = useState(
    edit?.performedBy ?? (initial?.vendor || "자체"),
  );
  // 기구별 판정(놀이시설) — 항목이 정한다. 그 외 항목은 빈 배열이고 단일 판정을 쓴다
  const [units, setUnits] = useState<Unit[]>(
    edit?.units?.length
      ? edit.units
      : unitsFrom(initial),
  );
  const [single, setSingle] = useState<string>(
    edit?.result ?? initial?.resultChoices[0] ?? "정상",
  );
  const [barrier, setBarrier] = useState(edit?.barrier ?? false);
  const [findings, setFindings] = useState(edit?.findings ?? "");
  const [actions, setActions] = useState(edit?.actions ?? "");
  // 천단위 콤마는 표시용 — 서버(parseWon)가 숫자만 걸러 읽는다
  const [cost, setCost] = useState(
    edit && edit.cost > 0 ? edit.cost.toLocaleString("ko-KR") : "",
  );
  const [files, setFiles] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const pick = (o: ItemOption) => {
    setItemId(o.id);
    setPerformedBy(o.vendor || "자체");
    setUnits(unitsFrom(o));
    setSingle(o.resultChoices[0]);
  };

  const addUnit = (name: string) =>
    setUnits((p) => [...p, { name, result: item!.resultChoices[0] }]);

  // 기구별 판정은 가장 나쁜 것이 기록 대표 판정 — 서버도 같은 규칙으로 다시 계산한다
  const byUnit = !!item?.units;
  const result = byUnit
    ? worstResult(
        units.map((u) => u.result),
        item!.resultChoices,
      )
    : single;
  const followup = followupOf(result, doneAt);

  const addFiles = async (list: FileList | null) => {
    if (!list) return;
    const shrunk = await Promise.all([...list].map(shrinkImage));
    setFiles((prev) => [...prev, ...shrunk]);
  };

  // ── ① 항목 선택 그리드 ──────────────────────────────────────
  if (!item)
    return (
      <div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => pick(o)}
              className={`rounded-lg border bg-card p-4 text-left transition-all hover:border-gray-300 hover:shadow-sm ${
                o.status === "overdue"
                  ? "border-red-200"
                  : o.status === "imminent"
                    ? "border-amber-200"
                    : ""
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-sm font-semibold">{o.name}</span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_PILL[o.status].cls}`}
                >
                  {o.status === "ok" ? dueText(o) : STATUS_PILL[o.status].label}
                </span>
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {o.cycle}
                {o.status !== "ok" && o.left !== null && ` · ${dueText(o)}`}
                {o.vendor && ` · ${o.vendor}`}
              </span>
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          급한 항목부터 보여드립니다 — 카드를 누르면 실시일·결과·첨부를 입력합니다.
        </p>
      </div>
    );

  // ── ② 상세 폼 + 라이브 A4 미리보기 ─────────────────────────
  return (
    <form
      action={(fd) => {
        for (const f of files) fd.append("files", f);
        formAction(fd);
      }}
    >
      {edit ? (
        <input type="hidden" name="docId" value={edit.docId} />
      ) : (
        <input type="hidden" name="itemId" value={item.id} />
      )}
      {/* 판정·기구는 제어 상태라 hidden으로 실어 보낸다 — 화면 요소는 미리보기용 */}
      <input type="hidden" name="result" value={result} />
      {byUnit && <input type="hidden" name="units" value={JSON.stringify(units)} />}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* 프로젝트 표준 폼(공지완성과 동일): Card + Label + Input — 모듈별 폼 스타일을 만들지 않는다 */}
        <Card className="space-y-4 p-6">
          <div>
            <span className="mb-1 flex items-center justify-between">
              <Label>점검 항목</Label>
              {!edit && !preselect && (
                <button
                  type="button"
                  onClick={() => setItemId(null)}
                  className="inline-flex items-center gap-0.5 text-xs font-normal text-muted-foreground hover:text-foreground"
                >
                  <ChevronLeft className="size-3.5" /> 다시 선택
                </button>
              )}
            </span>
            <p className="text-sm font-medium">{item.name}</p>
            {!edit && item.lastDoneAt && (
              <p className="mt-1 text-xs text-muted-foreground">
                마지막 실시 {item.lastDoneAt} — 저장하면 이 날짜가 갱신됩니다.
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="doneAt">실시일자</Label>
              <Input
                id="doneAt"
                name="doneAt"
                type="date"
                value={doneAt}
                onChange={(e) => setDoneAt(e.target.value)}
                required
                className="mt-1.5 max-sm:h-11"
              />
            </div>
            <div>
              <Label htmlFor="performedBy">수행</Label>
              <Input
                id="performedBy"
                name="performedBy"
                value={performedBy}
                onChange={(e) => setPerformedBy(e.target.value)}
                placeholder="자체"
                autoComplete="off"
                className="mt-1.5 max-sm:h-11"
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                자체 점검이면 &ldquo;자체&rdquo;, 업체·기관이 했으면 그 이름을 적으세요.
              </p>
            </div>
          </div>

          {/* 판정 — 라디오 대신 큰 토글. 현장 폰 입력(시안 D)의 핵심 타깃 */}
          {byUnit ? (
            <div>
              <Label>놀이기구별 판정</Label>
              {/* 직전 기록의 기구 목록이 미리 깔린다 — 남은 입력이 아니라 불러온 목록임을 말한다 */}
              {!edit && units.length > 0 && (item.units?.length ?? 0) > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  지난 기록의 놀이기구 목록을 불러왔습니다 — 판정은 초기화되어
                  있으니 이번 달 결과만 누르면 됩니다.
                </p>
              )}
              <div className="mt-1.5 space-y-1.5">
                {units.map((u, i) => (
                  <div key={i} className="rounded-lg border p-2.5">
                    <div className="flex items-center gap-2">
                      <Input
                        value={u.name}
                        onChange={(e) =>
                          setUnits((p) =>
                            p.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                          )
                        }
                        placeholder="기구 이름 (예: 조합놀이대, 그네)"
                        autoComplete="off"
                        className="h-8 min-w-0 flex-1 max-sm:h-10"
                        // 새 행이 목록 끝에 생기므로 커서를 데려간다. 마운트 시점에만
                        // 걸려서 다음 달 목록(이름이 이미 있음)에는 안 걸린다
                        autoFocus={!u.name && i === units.length - 1}
                      />
                      <button
                        type="button"
                        aria-label="기구 삭제"
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => setUnits((p) => p.filter((_, j) => j !== i))}
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                    {/* 판정만 폰에서 크게 유지한다 — 현장에서 엄지로 누르는 유일한 입력이다 */}
                    <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                      {item.resultChoices.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() =>
                            setUnits((p) =>
                              p.map((x, j) => (j === i ? { ...x, result: c } : x)),
                            )
                          }
                          className={`h-8 rounded-lg text-xs font-bold transition-colors max-sm:h-11 max-sm:text-sm ${
                            u.result === c ? toneOf(c).on : toneOf(c).off
                          }`}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {/* 목록 끝 — 담는 동작이 일어나는 자리. 첨부의 [파일 선택]과 같은 규격 */}
              <Button
                type="button"
                variant="outline"
                className="mt-1.5 h-11 sm:h-8 sm:px-3 sm:text-xs"
                onClick={() => addUnit("")}
              >
                <Plus className="size-4" /> 놀이기구 추가
              </Button>
              {units.length === 0 && (
                <p className="mt-1.5 text-sm text-muted-foreground">
                  그네·미끄럼틀처럼 놀이기구를 한 대씩 넣고 판정해 주세요. 다음
                  달부터는 이 목록이 그대로 나옵니다.
                </p>
              )}
              {/* 판정 기준은 오른쪽 열로 뺐다 — 폼이 길어지면 기구 목록이 밀린다.
                  오른쪽 열이 없는 화면(lg 미만)에서는 접어서 여기 남긴다:
                  요주의·요수리를 구분할 근거가 현장에서 사라지면 안 된다 */}
              <details className="mt-1.5 lg:hidden">
                <summary className="cursor-pointer text-xs text-muted-foreground">
                  판정 기준 보기
                </summary>
                <ResultLegend choices={item.resultChoices} className="mt-1" />
              </details>
            </div>
          ) : (
            <div>
              <Label className="mb-1.5">결과</Label>
              <div className="grid max-w-sm grid-cols-2 gap-2">
                {item.resultChoices.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setSingle(c)}
                    className={`h-12 rounded-lg text-sm font-bold transition-colors ${
                      single === c ? toneOf(c).on : toneOf(c).off
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 후속 조치 — 이용금지는 법정 1개월, 요수리는 앱 기본 30일 */}
          {followup && (
            <div
              className={`rounded-lg border p-3 text-sm ${
                followup.legal
                  ? "border-red-200 bg-red-50/60 text-red-800"
                  : "border-amber-200 bg-amber-50/60 text-amber-800"
              }`}
            >
              <p className="flex items-center gap-1.5 font-semibold">
                <AlertTriangle className="size-4 shrink-0" />
                {followup.title} — {followup.dueYmd}까지
              </p>
              <p className="mt-1 text-xs">{followup.note}</p>
              <p className="mt-1 text-xs">
                저장하면 이 기한의 작업지시가 자동으로 만들어지고, 기한이 다가오면
                알려 드립니다.
              </p>
              {result === "이용금지" && (
                <label className="mt-2 flex items-center gap-2 font-medium">
                  <input
                    type="checkbox"
                    name="barrier"
                    checked={barrier}
                    onChange={(e) => setBarrier(e.target.checked)}
                    className="size-4"
                  />
                  안전선·이용금지 표지판을 설치해 이용을 차단했습니다
                </label>
              )}
            </div>
          )}

          {needsFindings(result) && (
            <>
              <div>
                <Label htmlFor="findings">지적 내용</Label>
                <Textarea
                  id="findings"
                  name="findings"
                  rows={3}
                  value={findings}
                  onChange={(e) => setFindings(e.target.value)}
                  placeholder={"한 줄에 하나씩 적어 주세요.\n예) 지하 1층 소화전 표시등 불량"}
                  className="mt-1.5"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  업체 보고서가 있으면 요지만 적고 파일을 첨부하세요 — 일지에는
                  &ldquo;상세는 붙임 참조&rdquo;가 성립합니다.
                </p>
              </div>
              <div>
                <Label htmlFor="actions">조치 계획</Label>
                <Textarea
                  id="actions"
                  name="actions"
                  rows={3}
                  value={actions}
                  onChange={(e) => setActions(e.target.value)}
                  placeholder={"예) 표시등 교체 — 8월 중 업체 발주"}
                  className="mt-1.5"
                />
              </div>
            </>
          )}

          <div>
            <Label htmlFor="cost">비용 (선택, 원)</Label>
            <Input
              id="cost"
              name="cost"
              inputMode="numeric"
              placeholder="예: 350,000"
              autoComplete="off"
              className="mt-1.5 w-48 max-sm:h-11"
              value={cost}
              onChange={(e) => {
                const n = e.target.value.replace(/[^0-9]/g, "");
                setCost(n ? Number(n).toLocaleString("ko-KR") : "");
              }}
            />
          </div>

          {/* 첨부는 저장과 한 요청 — 수정 모드에서는 문서 화면의 첨부 패널이 담당 */}
          {!edit && (
            <div>
              <Label className="mb-1.5">첨부 (선택) — 성적서·검사필증·업체 보고서</Label>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,application/pdf"
                multiple
                className="hidden"
                onChange={(e) => {
                  void addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              {/* capture — 폰에서는 카메라가 바로 열린다. 현장 증빙의 대부분이 사진이다 */}
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  void addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 sm:hidden"
                  onClick={() => cameraRef.current?.click()}
                >
                  <Camera className="size-4" /> 사진 촬영
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 sm:h-8 sm:px-3 sm:text-xs"
                  onClick={() => fileRef.current?.click()}
                >
                  <Paperclip className="size-4" /> 파일 선택
                </Button>
              </div>
              {files.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {files.map((f, i) => (
                    <li key={i} className="flex items-center gap-1.5 text-xs">
                      <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{f.name}</span>
                      <span className="shrink-0 font-mono text-muted-foreground">
                        {kb(f.size)}
                      </span>
                      <button
                        type="button"
                        aria-label="첨부 제거"
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() =>
                          setFiles((prev) => prev.filter((_, j) => j !== i))
                        }
                      >
                        <X className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                저장 후에도 문서 화면에서 더 올릴 수 있습니다.
              </p>
            </div>
          )}

          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          {/* 저장은 폰에서 하단 고정 — 긴 폼을 다 내려도 엄지 자리에 있다(시안 D) */}
          <div className="flex items-center gap-3 max-sm:sticky max-sm:bottom-0 max-sm:-mx-6 max-sm:-mb-6 max-sm:bg-gradient-to-t max-sm:from-card max-sm:via-card max-sm:px-6 max-sm:py-4">
            <Button
              type="submit"
              size="lg"
              disabled={pending}
              className="max-sm:h-12 max-sm:w-full"
            >
              {pending && <Loader2 className="size-4 animate-spin" />}
              {edit ? "수정 저장" : "기록 저장"}
            </Button>
            {!edit && (
              <span className="text-xs text-muted-foreground max-sm:hidden">
                저장하면 문서번호가 부여되고 다음 도래일이 자동으로 이동합니다.
              </span>
            )}
          </div>
        </Card>

        {/* 라이브 미리보기 — 입력하는 대로 A4가 채워진다. 인쇄는 문서 화면 몫 */}
        <aside className="hidden lg:sticky lg:top-5 lg:block">
          {byUnit && (
            <Card className="mb-3 p-4">
              <h4 className="mb-1.5 text-sm font-semibold">판정 기준</h4>
              <ResultLegend choices={item.resultChoices} />
            </Card>
          )}
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            A4 미리보기 — 저장하면 이 일지가 만들어집니다
          </p>
          <PaperScale>
            <InspectionPaper
              id="live-preview"
              data={{
                docNo: edit?.docNo || "(저장 시 부여)",
                itemName: item.name,
                legalBasis: item.legalBasis,
                doneAt,
                performedBy: performedBy || "자체",
                result,
                units: byUnit ? units.filter((u) => u.name.trim()) : [],
                barrier,
                scope: item.scope,
                findings: needsFindings(result) ? findings : "",
                actions: needsFindings(result) ? actions : "",
                cost: Number(cost.replace(/[^0-9]/g, "")) || 0,
                attachmentNames: [
                  ...(edit?.attachmentNames ?? []),
                  ...files.map((f) => f.name),
                ],
                author,
                office,
              }}
            />
          </PaperScale>
        </aside>
      </div>
    </form>
  );
}
