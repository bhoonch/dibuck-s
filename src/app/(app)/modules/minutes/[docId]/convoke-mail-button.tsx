"use client";

import { useState, useTransition } from "react";
import { Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sendConvocationEmails } from "../actions";

/**
 * 소집 통지 이메일 발송 — 명부에 이메일이 있는 참석자에게 통지문 내용을 보낸다.
 * 미등록자는 이름을 보여줘 서면 전달 대상을 알린다(notice-button과 같은 패턴).
 */
export function ConvokeMailButton({ docId }: { docId: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    error?: string;
    sent?: number;
    noEmail?: string[];
  }>();

  return (
    <div className="mt-2">
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        disabled={pending}
        onClick={() =>
          startTransition(async () => setResult(await sendConvocationEmails(docId)))
        }
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Mail className="size-4" />
        )}
        이메일로 통지 보내기
      </Button>
      {result?.error && (
        <p className="mt-1.5 text-xs text-destructive">{result.error}</p>
      )}
      {result?.sent != null && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          참석자 {result.sent}명에게 보냈습니다.
          {(result.noEmail?.length ?? 0) > 0 && (
            <>
              <br />
              이메일 미등록(서면 전달): {result.noEmail!.join(", ")}
            </>
          )}
        </p>
      )}
    </div>
  );
}
