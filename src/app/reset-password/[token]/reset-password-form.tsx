"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetPassword } from "./actions";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPassword, undefined);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <div className="space-y-2">
        <Label htmlFor="password">새 비밀번호 (8자 이상)</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm">새 비밀번호 확인</Label>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>
      <p className="text-xs text-muted-foreground">
        비밀번호를 바꾸면 다른 기기에 남아 있는 로그인이 모두 해제됩니다.
      </p>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "변경 중..." : "비밀번호 변경하고 로그인"}
      </Button>
    </form>
  );
}
