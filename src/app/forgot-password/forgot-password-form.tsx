"use client";

import { useActionState } from "react";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordReset } from "./actions";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(
    requestPasswordReset,
    undefined,
  );

  if (state?.sent)
    return (
      <div className="space-y-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-success">
          <MailCheck className="size-4" />
          재설정 메일을 보냈습니다.
        </p>
        <p className="text-sm text-muted-foreground">
          메일에 담긴 링크로 새 비밀번호를 설정해 주세요. 링크는{" "}
          <b className="text-foreground">1시간</b> 동안 유효합니다.
        </p>
        <p className="text-sm text-muted-foreground">
          메일이 보이지 않으면 스팸함을 확인해 주세요. 가입된 계정이 없는
          이메일에는 메일이 가지 않습니다.
        </p>
      </div>
    );

  return (
    <form action={action} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        가입 시 등록한 이메일을 입력하시면 재설정 링크를 보내드립니다.
      </p>
      <div className="space-y-2">
        <Label htmlFor="email">이메일</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      </div>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "보내는 중..." : "재설정 메일 받기"}
      </Button>
    </form>
  );
}
