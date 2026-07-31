"use client";

import { useActionState, useState, useTransition } from "react";
import { Check, Copy, Loader2, RefreshCw, Send, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { panel, panelTitle } from "@/components/gian-ui";
import {
  actOnGianStep,
  reissueGianToken,
  submitGian,
  voidGian,
  withdrawGian,
} from "../approval-actions";

export type PanelStep = {
  id: string;
  order: number;
  label: string;
  status: string;
  comment?: string | null;
  /** 승인·반려한 날짜 (yyyy-mm-dd) */
  actedAt?: string | null;
  isMine: boolean;
  isExternal: boolean;
  /** 기안자 칸 — 상신 때 자동 서명되므로 "이미 결재한 사람"으로 세지 않는다 */
  isDrafter: boolean;
  token?: string | null;
  tokenExpired?: boolean;
  /** 외부(토큰) 서명 증적 — 감사에서 "누가 눌렀는가"를 묻을 때의 답 */
  signature?: { typedName?: string; ip?: string } | null;
};

const dotColor: Record<string, string> = {
  approved: "bg-[var(--gian-ok)]",
  rejected: "bg-[var(--gian-stamp)]",
  pending: "bg-[var(--gian-warn)]",
};

const stateText: Record<string, string> = {
  approved: "승인",
  rejected: "반려",
  pending: "결재 차례",
};

const stateColor: Record<string, string> = {
  approved: "text-[var(--gian-ok)] font-bold",
  rejected: "text-[var(--gian-stamp)] font-bold",
  pending: "text-[var(--gian-warn)] font-bold",
};

export function ApprovalPanel({
  docId,
  docStatus,
  canSubmit,
  steps,
  numbered,
  waiverNote,
  evidenceGap,
}: {
  docId: string;
  docStatus: string;
  /** 채번됐는가 = 한 번이라도 상신됐는가. 폐기가 기록으로 남는지 진짜 삭제인지를 가른다 */
  numbered: boolean;
  canSubmit: boolean;
  steps: PanelStep[];
  /** 견적서 없이 상신한 사유 — 결재자가 "증빙 없음"을 알고 승인해야 한다 */
  waiverNote?: string | null;
  /** 지금 부족한 증빙. 파일을 올리면 서버가 null로 내려주므로 사유칸이 저절로 닫힌다 */
  evidenceGap?: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [triedSubmit, setTriedSubmit] = useState(false);
  const [waiverReason, setWaiverReason] = useState("");

  /*
   * 사유칸은 상태로 굳히지 않는다 — 예전에는 한 번 막히면 needWaiver가 true로 남아,
   * 견적서를 올려 증빙이 채워진 뒤에도 계속 사유를 요구했다. 판정은 늘 서버가 한다.
   */
  const needWaiver = triedSubmit && !!evidenceGap;
  const [actState, actAction, actPending] = useActionState(
    actOnGianStep,
    undefined,
  );

  const current = steps.find((s) => s.status === "pending");
  const rejected = steps.find((s) => s.status === "rejected");
  // 기안자 본인의 자동 서명을 뺀 누군가가 처리했으면 회수는 막힌다(서버도 같은 조건).
  // 자동 서명까지 세면 결재선이 2칸 이상인 문서는 상신 직후에도 회수 버튼이 안 뜬다.
  const anyActed = steps.some(
    (s) =>
      !s.isDrafter && (s.status === "approved" || s.status === "rejected"),
  );

  const run = (fn: () => Promise<{ error?: string } | undefined>) => {
    setError(undefined);
    startTransition(async () => {
      const r = await fn();
      if (r?.error) setError(r.error);
    });
  };

  return (
    <div className={panel}>
      <h4 className={panelTitle}>결재선</h4>

      {steps.length === 0 ? (
        <p className="text-sm text-[var(--gian-ink-soft)]">
          아직 상신 전입니다. 상신하면 지금 결재선이 스냅샷으로 굳습니다.
        </p>
      ) : (
        /*
         * 세로 타임라인 — 예전에는 칩 줄과 상태 목록이 같은 정보를 두 번 그렸고,
         * 5단이 되면 칩이 줄바꿈되며 순서가 끊겼다. 한 줄기로 세우면 이름·상태·의견·
         * 처리일이 한자리에 모이고 단계가 늘어도 모양이 유지된다.
         */
        <ol className="relative">
          {steps.map((s, i) => (
            <li key={s.id} className="relative flex gap-3 pb-3 last:pb-0">
              {i < steps.length - 1 && (
                <span className="absolute top-4 bottom-0 left-[3.5px] w-px bg-[var(--gian-line-strong)]" />
              )}
              <span
                className={`relative z-10 mt-1.5 size-2 shrink-0 rounded-full ring-4 ring-[var(--gian-card)] ${
                  dotColor[s.status] ?? "bg-[var(--gian-line-strong)]"
                }`}
              />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span className="font-semibold">{s.label}</span>
                  <span
                    className={`text-xs ${stateColor[s.status] ?? "text-[var(--gian-ink-soft)]"}`}
                  >
                    {stateText[s.status] ?? "대기"}
                  </span>
                  {s.actedAt && (
                    <span className="font-mono text-xs text-[var(--gian-ink-soft)]">
                      {s.actedAt}
                    </span>
                  )}
                </p>
                {s.comment && (
                  <p className="mt-0.5 text-xs text-[var(--gian-ink-soft)]">
                    &ldquo;{s.comment}&rdquo;
                  </p>
                )}
                {/* 외부 서명은 로그인 기록이 없다 — 대신 입력 성명·접속 IP를 남긴다 */}
                {s.signature?.typedName && (
                  <p className="mt-0.5 text-xs text-[var(--gian-ink-soft)]">
                    서명 {s.signature.typedName}
                    {s.signature.ip && (
                      <span className="font-mono"> · {s.signature.ip}</span>
                    )}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      {/* 견적서 없이 상신한 문서 — 결재자가 먼저 본다 */}
      {waiverNote && (
        <p className="mt-2 rounded-md bg-[var(--gian-stamp-soft)] p-2 text-xs text-[var(--gian-stamp)]">
          {waiverNote}
        </p>
      )}

      {/* 상신 / 재상신 */}
      {canSubmit && (docStatus === "draft" || docStatus === "rejected") && (
        <div className="mt-3 space-y-2 border-t border-[var(--gian-line)] pt-3">
          {rejected && docStatus === "rejected" && (
            <p className="rounded-md bg-[var(--gian-stamp-soft)] p-2 text-xs text-[var(--gian-stamp)]">
              {rejected.label}이(가) 반려했습니다
              {rejected.comment ? ` — "${rejected.comment}"` : ""}. 다시
              상신하면 결재가 처음부터 진행됩니다.
            </p>
          )}
          {/* 증빙 부족 → 사유를 받아 긴급 예외로 상신 (사유는 결재선·인쇄물에 남는다) */}
          {needWaiver && (
            <textarea
              rows={2}
              value={waiverReason}
              onChange={(e) => setWaiverReason(e.target.value)}
              placeholder="견적서 없이 상신하는 사유 (결재자와 인쇄물에 표시됩니다)"
              className="w-full rounded-md border border-[var(--gian-line-strong)] bg-[var(--gian-paper)] px-3 py-2 text-sm"
            />
          )}
          <Button
            size="lg"
            className="w-full"
            disabled={pending || (needWaiver && !waiverReason.trim())}
            onClick={() => {
              setError(undefined);
              startTransition(async () => {
                const r = await submitGian(
                  docId,
                  needWaiver ? waiverReason : undefined,
                );
                if (r?.needWaiver) setTriedSubmit(true);
                if (r?.error) setError(r.error);
              });
            }}
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            {needWaiver
              ? "사유와 함께 상신"
              : docStatus === "rejected"
                ? "다시 상신"
                : "결재 상신"}
          </Button>
        </div>
      )}

      {/* 내 차례 — 승인/반려 */}
      {current?.isMine && (
        <form
          action={actAction}
          className="mt-3 space-y-2 border-t border-[var(--gian-line)] pt-3"
        >
          <input type="hidden" name="stepId" value={current.id} />
          <textarea
            name="comment"
            rows={2}
            placeholder="의견 (반려 시 필수)"
            className="w-full rounded-md border border-[var(--gian-line-strong)] bg-[var(--gian-paper)] px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <Button type="submit" name="action" value="approve" disabled={actPending}>
              <Check className="size-4" /> 승인
            </Button>
            <Button
              type="submit"
              name="action"
              value="reject"
              variant="destructive"
              disabled={actPending}
            >
              <X className="size-4" /> 반려
            </Button>
          </div>
          {actState?.error && (
            <p className="text-xs text-destructive">{actState.error}</p>
          )}
        </form>
      )}

      {/* 외부 결재자 차례 — 서명 링크 전달 */}
      {current?.isExternal && (
        <div className="mt-3 space-y-2 border-t border-[var(--gian-line)] pt-3">
          <p className="text-xs text-[var(--gian-ink-soft)]">
            {current.label} 차례입니다. 서명 링크를 카카오톡·문자로 전달하세요.
            {current.tokenExpired && " (링크가 만료되어 재발급이 필요합니다)"}
          </p>
          <div className="flex flex-wrap gap-2">
            {current.token && !current.tokenExpired && (
              <Button
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(
                    `${window.location.origin}/approve/${current.token}`,
                  );
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                <Copy className="size-4" />
                {copied ? "복사됨!" : "서명 링크 복사"}
              </Button>
            )}
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => run(() => reissueGianToken(current.id))}
            >
              <RefreshCw className="size-4" /> 링크 재발급
            </Button>
          </div>
        </div>
      )}

      {docStatus === "final" && (
        <p className="mt-3 border-t border-[var(--gian-line)] pt-3 text-sm font-bold text-[var(--gian-ok)]">
          결재가 완료된 문서입니다.
        </p>
      )}
      {docStatus === "void" && (
        <p className="mt-3 border-t border-[var(--gian-line)] pt-3 text-sm text-[var(--gian-ink-soft)]">
          폐기된 문서입니다. 기록으로만 남아 있습니다.
        </p>
      )}

      {/*
        회수·폐기 — 상신하고 나면 고칠 길이 반려뿐이었다.
        승인 전이면 회수해서 초안으로, 이미 진행됐으면 폐기(기록은 남는다).
      */}
      {canSubmit && docStatus !== "final" && docStatus !== "void" && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-[var(--gian-line)] pt-3">
          {docStatus === "pending" && !anyActed && (
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => run(() => withdrawGian(docId))}
            >
              <Undo2 className="size-3.5" /> 상신 회수
            </Button>
          )}
          {/* 옆의 "상신 회수"와 같은 outline — ghost는 버튼이 아니라 글씨로 읽혔다 */}
          <ConfirmDialog
            trigger={
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive"
              >
                {numbered ? "문서 폐기" : "초안 삭제"}
              </Button>
            }
            title={numbered ? "이 문서를 폐기할까요?" : "이 초안을 삭제할까요?"}
            description={
              numbered
                ? "목록에는 '폐기'로 남고 열람만 됩니다. 결재 기록을 지우지 않기 위해 삭제하지 않습니다."
                : "한 번도 상신하지 않아 문서번호도 결재 기록도 없습니다. 목록에서 완전히 사라지며 되돌릴 수 없습니다."
            }
            confirmLabel={numbered ? "폐기" : "삭제"}
            destructive
            onConfirm={() => run(() => voidGian(docId))}
          />
        </div>
      )}

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}
