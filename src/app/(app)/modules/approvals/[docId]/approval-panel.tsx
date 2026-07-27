"use client";

import { useActionState, useState, useTransition } from "react";
import { Check, Copy, Loader2, RefreshCw, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
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
    <div className="space-y-3 rounded-lg border bg-card p-3 text-sm">
      <p className="font-semibold">결재</p>

      {/* 진행 현황 */}
      <ol className="space-y-1">
        {steps.map((s) => (
          <li key={s.id} className="flex items-center gap-2">
            <span
              className={`inline-flex size-5 items-center justify-center rounded-full text-[11px] font-semibold ${
                s.status === "approved"
                  ? "bg-green-100 text-green-700"
                  : s.status === "rejected"
                    ? "bg-red-100 text-red-700"
                    : s.status === "pending"
                      ? "bg-blue-100 text-blue-700"
                      : "bg-gray-100 text-gray-500"
              }`}
            >
              {s.status === "approved" ? "✓" : s.status === "rejected" ? "✕" : s.order}
            </span>
            <span className={s.status === "pending" ? "font-medium" : ""}>
              {s.label}
            </span>
            {s.status === "pending" && (
              <span className="text-xs text-blue-700">결재 차례</span>
            )}
            {s.comment && (
              <span className="text-xs text-muted-foreground">— {s.comment}</span>
            )}
          </li>
        ))}
        {steps.length === 0 && (
          <li className="text-muted-foreground">아직 상신 전입니다.</li>
        )}
      </ol>

      {/* 상신 / 재상신 */}
      {canSubmit && (docStatus === "draft" || docStatus === "rejected") && (
        <div className="space-y-2 border-t pt-3">
          {rejected && docStatus === "rejected" && (
            <p className="rounded-md bg-red-50 p-2 text-xs text-red-700">
              {rejected.label}이(가) 반려했습니다
              {rejected.comment ? ` — "${rejected.comment}"` : ""}. 다시
              상신하면 결재가 처음부터 진행됩니다.
            </p>
          )}
          <Button
            size="lg"
            disabled={pending}
            onClick={() => run(() => submitGian(docId))}
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            {docStatus === "rejected" ? "다시 상신" : "결재 상신"}
          </Button>
        </div>
      )}

      {/* 내 차례 — 승인/반려 */}
      {current?.isMine && (
        <form action={actAction} className="space-y-2 border-t pt-3">
          <input type="hidden" name="stepId" value={current.id} />
          <textarea
            name="comment"
            rows={2}
            placeholder="의견 (반려 시 필수)"
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <Button
              type="submit"
              name="action"
              value="approve"
              disabled={actPending}
            >
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
        <div className="space-y-2 border-t pt-3">
          <p className="text-xs text-muted-foreground">
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
        <p className="border-t pt-3 text-sm font-medium text-green-700">
          결재가 완료된 문서입니다.
        </p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
