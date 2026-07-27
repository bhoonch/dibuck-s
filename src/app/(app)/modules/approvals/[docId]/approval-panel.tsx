"use client";

import { useActionState, useState, useTransition } from "react";
import { Check, Copy, Loader2, RefreshCw, Send, X } from "lucide-react";
import { actBtn, actBtnPrimary, genBtn, panel, panelTitle } from "@/components/gian-ui";
import {
  actOnGianStep,
  reissueGianToken,
  submitGian,
} from "../approval-actions";

export type PanelStep = {
  id: string;
  order: number;
  label: string;
  status: string;
  comment?: string | null;
  isMine: boolean;
  isExternal: boolean;
  token?: string | null;
  tokenExpired?: boolean;
};

/* 목업 .esign-status 의 상태 점 — 승인 초록 / 차례 앰버 / 대기 회색 */
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

export function ApprovalPanel({
  docId,
  docStatus,
  canSubmit,
  steps,
}: {
  docId: string;
  docStatus: string;
  canSubmit: boolean;
  steps: PanelStep[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [actState, actAction, actPending] = useActionState(
    actOnGianStep,
    undefined,
  );

  const current = steps.find((s) => s.status === "pending");
  const rejected = steps.find((s) => s.status === "rejected");

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

      {/* 결재선 플로우 (목업 .flow) — 상신 전에는 예정 결재선이 그대로 보인다 */}
      <div className="flex flex-wrap items-center gap-1.5">
        {steps.map((s, i) => (
          <span key={s.id} className="flex items-center gap-1.5">
            {i > 0 && (
              <span className="text-[12px] text-[var(--gian-ink-soft)]">▸</span>
            )}
            <span
              className={`rounded border px-2.5 py-1 text-[13px] font-semibold ${
                s.status === "pending"
                  ? "border-[var(--gian-navy)] bg-[var(--gian-card)] text-[var(--gian-navy)]"
                  : "border-[var(--gian-line-strong)] bg-[var(--gian-paper)]"
              }`}
            >
              {s.label}
            </span>
          </span>
        ))}
        {steps.length === 0 && (
          <span className="text-[13px] text-[var(--gian-ink-soft)]">
            아직 상신 전입니다.
          </span>
        )}
      </div>

      {/* 진행 현황 (목업 .esign-status) */}
      {steps.length > 0 && (
        <ul className="mt-3">
          {steps.map((s) => (
            <li
              key={s.id}
              className="flex items-center gap-2 py-[5px] text-[13px] [&+li]:border-t [&+li]:border-[var(--gian-line)]"
            >
              <span
                className={`size-2 shrink-0 rounded-full ${dotColor[s.status] ?? "bg-[var(--gian-line-strong)]"}`}
              />
              <span className="flex-1 font-semibold">{s.label}</span>
              <span
                className={`text-[12px] ${
                  s.status === "approved"
                    ? "font-bold text-[var(--gian-ok)]"
                    : s.status === "rejected"
                      ? "font-bold text-[var(--gian-stamp)]"
                      : "text-[var(--gian-ink-soft)]"
                }`}
              >
                {stateText[s.status] ?? "대기"}
              </span>
            </li>
          ))}
        </ul>
      )}
      {steps.some((s) => s.comment) && (
        <ul className="mt-2 space-y-1">
          {steps
            .filter((s) => s.comment)
            .map((s) => (
              <li key={s.id} className="text-[12px] text-[var(--gian-ink-soft)]">
                {s.label} — &ldquo;{s.comment}&rdquo;
              </li>
            ))}
        </ul>
      )}

      {/* 상신 / 재상신 */}
      {canSubmit && (docStatus === "draft" || docStatus === "rejected") && (
        <div className="mt-3 space-y-2 border-t border-[var(--gian-line)] pt-3">
          {rejected && docStatus === "rejected" && (
            <p className="rounded-md bg-[var(--gian-stamp-soft)] p-2 text-[12.5px] text-[var(--gian-stamp)]">
              {rejected.label}이(가) 반려했습니다
              {rejected.comment ? ` — "${rejected.comment}"` : ""}. 다시
              상신하면 결재가 처음부터 진행됩니다.
            </p>
          )}
          <button
            type="button"
            className={genBtn}
            disabled={pending}
            onClick={() => run(() => submitGian(docId))}
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            {docStatus === "rejected" ? "다시 상신" : "결재 상신"}
          </button>
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
            className="w-full rounded-[5px] border border-[var(--gian-line-strong)] bg-[var(--gian-paper)] px-3 py-2 text-[13.5px]"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              name="action"
              value="approve"
              className={actBtnPrimary}
              disabled={actPending}
            >
              <Check className="size-4" /> 승인
            </button>
            <button
              type="submit"
              name="action"
              value="reject"
              className={`${actBtn} text-[var(--gian-stamp)] hover:border-[var(--gian-stamp)] hover:text-[var(--gian-stamp)]`}
              disabled={actPending}
            >
              <X className="size-4" /> 반려
            </button>
          </div>
          {actState?.error && (
            <p className="text-[12px] text-[var(--gian-stamp)]">
              {actState.error}
            </p>
          )}
        </form>
      )}

      {/* 외부 결재자 차례 — 서명 링크 전달 */}
      {current?.isExternal && (
        <div className="mt-3 space-y-2 border-t border-[var(--gian-line)] pt-3">
          <p className="text-[12.5px] text-[var(--gian-ink-soft)]">
            {current.label} 차례입니다. 서명 링크를 카카오톡·문자로 전달하세요.
            {current.tokenExpired && " (링크가 만료되어 재발급이 필요합니다)"}
          </p>
          <div className="flex flex-wrap gap-2">
            {current.token && !current.tokenExpired && (
              <button
                type="button"
                className={actBtn}
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
              </button>
            )}
            <button
              type="button"
              className={actBtn}
              disabled={pending}
              onClick={() => run(() => reissueGianToken(current.id))}
            >
              <RefreshCw className="size-4" /> 링크 재발급
            </button>
          </div>
        </div>
      )}

      {docStatus === "final" && (
        <p className="mt-3 border-t border-[var(--gian-line)] pt-3 text-[13px] font-bold text-[var(--gian-ok)]">
          결재가 완료된 문서입니다.
        </p>
      )}
      {error && (
        <p className="mt-2 text-[12px] text-[var(--gian-stamp)]">{error}</p>
      )}
    </div>
  );
}
