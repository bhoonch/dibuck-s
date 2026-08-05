"use client";

import { useActionState, useRef, useState } from "react";
import { ChevronLeft, FileText, Loader2, Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PaperScale } from "@/components/paper-scale";
import { InspectionPaper } from "@/components/inspection-paper";
import { STATUS_PILL } from "@/lib/inspection/status";
import type { InspectionStatus } from "@/lib/inspection/schedule";
import {
  createInspectionRecord,
  saveInspectionRecord,
  type RecordState,
} from "../actions";

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
  const [doneAt, setDoneAt] = useState(edit?.doneAt ?? today);
  const [performedBy, setPerformedBy] = useState(
    edit?.performedBy ??
      (items.find((it) => it.id === initialId)?.vendor || "자체"),
  );
  const [result, setResult] = useState<string>(edit?.result ?? "정상");
  const [findings, setFindings] = useState(edit?.findings ?? "");
  const [actions, setActions] = useState(edit?.actions ?? "");
  // 천단위 콤마는 표시용 — 서버(parseWon)가 숫자만 걸러 읽는다
  const [cost, setCost] = useState(
    edit && edit.cost > 0 ? edit.cost.toLocaleString("ko-KR") : "",
  );
  const [files, setFiles] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const pick = (o: ItemOption) => {
    setItemId(o.id);
    setPerformedBy(o.vendor || "자체");
  };

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
      {/* 라디오·비용은 제어 상태라 hidden으로 실어 보낸다 — 화면 요소는 미리보기용 */}
      <input type="hidden" name="result" value={result} />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="space-y-4 p-6">
          <div>
            <span className="mb-1 flex items-center justify-between text-sm font-medium">
              점검 항목
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
              <label className="mb-1 block text-sm font-medium" htmlFor="doneAt">
                실시일자
              </label>
              <Input
                id="doneAt"
                name="doneAt"
                type="date"
                value={doneAt}
                onChange={(e) => setDoneAt(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="performedBy">
                수행 (자체 또는 업체·기관명)
              </label>
              <Input
                id="performedBy"
                name="performedBy"
                value={performedBy}
                onChange={(e) => setPerformedBy(e.target.value)}
                placeholder="자체"
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
                  value={findings}
                  onChange={(e) => setFindings(e.target.value)}
                  placeholder={"한 줄에 하나씩 적어 주세요.\n예) 지하 1층 소화전 표시등 불량"}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  업체 보고서가 있으면 요지만 적고 파일을 첨부하세요 — 일지에는
                  &ldquo;상세는 붙임 참조&rdquo;가 성립합니다.
                </p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="actions">
                  조치 계획
                </label>
                <Textarea
                  id="actions"
                  name="actions"
                  rows={3}
                  value={actions}
                  onChange={(e) => setActions(e.target.value)}
                  placeholder={"예) 표시등 교체 — 8월 중 업체 발주"}
                />
              </div>
            </>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="cost">
              비용 (선택, 원)
            </label>
            <Input
              id="cost"
              name="cost"
              inputMode="numeric"
              placeholder="예: 350,000"
              className="w-48"
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
              <span className="mb-1 block text-sm font-medium">
                첨부 (선택) — 성적서·검사필증·업체 보고서
              </span>
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
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
              >
                <Paperclip className="size-4" /> 파일 선택
              </Button>
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
          <div className="flex items-center gap-3">
            <Button type="submit" size="lg" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {edit ? "수정 저장" : "기록 저장"}
            </Button>
            {!edit && (
              <span className="text-xs text-muted-foreground">
                저장하면 문서번호가 부여되고 다음 도래일이 자동으로 이동합니다.
              </span>
            )}
          </div>
        </Card>

        {/* 라이브 미리보기 — 입력하는 대로 A4가 채워진다. 인쇄는 문서 화면 몫 */}
        <aside className="hidden lg:sticky lg:top-5 lg:block">
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
                findings: result === "지적사항" ? findings : "",
                actions: result === "지적사항" ? actions : "",
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
