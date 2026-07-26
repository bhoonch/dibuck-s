"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login } from "./actions";

export function LoginForm({
  kakaoEnabled,
  kakaoError,
}: {
  kakaoEnabled: boolean;
  kakaoError?: string;
}) {
  const [state, action, pending] = useActionState(login, undefined);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-4">
      <div className="flex items-center gap-2 text-primary">
        <Building2 className="size-8" />
        <span className="text-2xl font-bold">디벅</span>
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">로그인</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form action={action} className="space-y-4">
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
            <div className="space-y-2">
              <Label htmlFor="password">비밀번호</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>
            {(state?.error || kakaoError) && (
              <p className="text-sm text-destructive">
                {state?.error ?? kakaoError}
              </p>
            )}
            <Button type="submit" size="lg" className="w-full" disabled={pending}>
              {pending ? "확인 중..." : "로그인"}
            </Button>
          </form>

          {kakaoEnabled && (
            <a
              href="/api/auth/kakao"
              className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#FEE500] text-sm font-semibold text-[#191919] transition-opacity hover:opacity-90"
            >
              {/* 카카오 심볼 (말풍선) */}
              <svg viewBox="0 0 24 24" className="size-4" fill="currentColor">
                <path d="M12 3C6.48 3 2 6.54 2 10.9c0 2.8 1.86 5.26 4.66 6.65-.2.76-.75 2.8-.86 3.24-.13.54.2.53.42.39.17-.12 2.72-1.85 3.82-2.6.63.09 1.29.14 1.96.14 5.52 0 10-3.54 10-7.9S17.52 3 12 3Z" />
              </svg>
              카카오로 로그인
            </a>
          )}

          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              아이디·비밀번호를 잊으셨나요?
            </summary>
            <div className="mt-2 space-y-1.5 rounded-lg bg-muted/50 p-3 text-muted-foreground">
              <p>
                <b className="text-foreground">아이디</b>는 가입 시 등록한 업무용
                이메일입니다.
              </p>
              <p>
                <b className="text-foreground">비밀번호</b>는 디벅 운영자가
                재설정해 드립니다. 관리사무소 대표 연락처로 문의해 주시면 임시
                비밀번호를 안내해 드려요.
              </p>
            </div>
          </details>
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        아직 디벅을 안 쓰고 계신가요?{" "}
        <Link
          href="/signup"
          className="font-semibold text-primary hover:underline"
        >
          무료로 시작하기
        </Link>
      </p>
    </main>
  );
}
