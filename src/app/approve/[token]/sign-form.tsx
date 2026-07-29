"use client";

import { useActionState } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signByToken } from "./actions";

export function SignForm({ token, signerName }: { token: string; signerName: string }) {
  const [state, formAction, pending] = useActionState(signByToken, undefined);

  if (state?.done)
    return (
      <div
        className={`rounded-lg border p-4 text-center text-sm font-medium ${
          state.done === "approve"
            ? "border-green-200 bg-green-50 text-green-700"
            : "border-red-200 bg-red-50 text-red-700"
        }`}
      >
        {state.done === "approve"
          ? "승인 처리되었습니다. 감사합니다."
          : "반려 처리되었습니다. 관리사무소에 전달됩니다."}
        <p className="mt-1 text-xs font-normal text-muted-foreground">
          이 창은 닫으셔도 됩니다.
        </p>
      </div>
    );

  return (
    <form action={formAction} className="space-y-3 rounded-lg border bg-card p-4">
      <p className="text-sm">
        <b>{signerName}</b>님, 문서를 확인하신 후 승인 또는 반려해 주세요.
      </p>
      <input type="hidden" name="token" value={token} />
      {/*
        성명 직접 입력 — 링크는 카카오톡으로 전달되므로 토큰만으로는 "누가 눌렀는지"를
        증명할 수 없다. 입력한 성명·접속 정보·시각이 기록으로 남는다.
      */}
      <div>
        <label
          htmlFor="typedName"
          className="mb-1 block text-xs text-muted-foreground"
        >
          본인 성명 (서명을 갈음합니다)
        </label>
        <input
          id="typedName"
          name="typedName"
          autoComplete="name"
          placeholder="성명을 입력해 주세요"
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
        />
      </div>
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
          size="lg"
          className="flex-1"
          disabled={pending}
        >
          <Check className="size-4" /> 승인
        </Button>
        <Button
          type="submit"
          name="action"
          value="reject"
          size="lg"
          variant="destructive"
          className="flex-1"
          disabled={pending}
        >
          <X className="size-4" /> 반려
        </Button>
      </div>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <p className="text-xs text-muted-foreground">
        입력하신 성명과 접속 정보·시각이 결재 기록으로 남습니다.
      </p>
    </form>
  );
}
