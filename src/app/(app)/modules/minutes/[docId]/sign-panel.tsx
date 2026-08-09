"use client";

import { useState, useTransition } from "react";
import { Copy, RefreshCw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requestSignatures, reissueSignToken } from "../actions";

export type SignStepRow = {
  order: number;
  label: string;
  name: string;
  stepId: string | null;
  status: string | null; // null = 아직 요청 전
  actedAt: string | null; // 표시용으로 이미 포맷된 값
  token: string | null;
  tokenExpired: boolean;
};

/** 완성본 서명 현황 카드 — 병렬 서명(전원 동시 pending)이라 순서가 아니라 진행률로 본다 */
export function SignPanel({
  docId,
  rows,
  requested,
}: {
  docId: string;
  rows: SignStepRow[];
  /** 스텝이 이미 생성됐는가 = 서명 요청을 한 번이라도 했는가 */
  requested: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [copiedOrder, setCopiedOrder] = useState<number | null>(null);

  const signed = rows.filter((r) => r.status === "approved").length;
  const allSigned = requested && rows.length > 0 && signed === rows.length;

  const run = (fn: () => Promise<{ error?: string } | undefined | void>) => {
    setError(undefined);
    startTransition(async () => {
      const r = await fn();
      if (r?.error) setError(r.error);
    });
  };

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">서명 현황</h4>
        {requested && (
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              allSigned
                ? "bg-green-50 text-green-700"
                : "bg-amber-50 text-amber-700"
            }`}
          >
            {allSigned ? "전원 서명 완료" : `서명 ${signed}/${rows.length}`}
          </span>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        관리규약이 정한 회의록 서명 방식을 확인하세요.
        <br />
        자필 서명이 필요한 단지는 인쇄해 서명란에 자필로 받으면 됩니다.
      </p>

      {!requested ? (
        <Button
          className="w-full"
          disabled={pending}
          onClick={() => run(() => requestSignatures(docId))}
        >
          <Send className="size-4" /> 서명 요청
        </Button>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.order} className="rounded-md border p-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">
                  {r.label} {r.name}
                </span>
                <span
                  className={
                    r.status === "approved"
                      ? "text-xs font-bold text-green-700"
                      : "text-xs text-muted-foreground"
                  }
                >
                  {r.status === "approved" ? r.actedAt : "대기"}
                </span>
              </div>
              {r.status !== "approved" && (
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {r.token && !r.tokenExpired && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(
                          `${window.location.origin}/sign/${r.token}`,
                        );
                        setCopiedOrder(r.order);
                        setTimeout(() => setCopiedOrder(null), 2000);
                      }}
                    >
                      <Copy className="size-3.5" />
                      {copiedOrder === r.order ? "복사됨!" : "링크 복사"}
                    </Button>
                  )}
                  {(r.tokenExpired || !r.token) && r.stepId && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={() => run(() => reissueSignToken(r.stepId!))}
                    >
                      <RefreshCw className="size-3.5" /> 재발급
                    </Button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </Card>
  );
}
