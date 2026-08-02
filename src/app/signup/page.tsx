"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signup } from "./actions";

export default function SignupPage() {
  const [state, action, pending] = useActionState(signup, undefined);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-4">
      <div className="flex items-center gap-2 text-primary">
        <Building2 className="size-8" />
        <span className="text-2xl font-bold">디벅</span>
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">무료로 시작하기</CardTitle>
          <CardDescription>
            가입 즉시 사용할 수 있고, 모듈은 구독할 때마다 무료 체험 기간이
            주어집니다. 카드 등록은 필요 없습니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={action} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tenantName">단지명</Label>
              <Input
                id="tenantName"
                name="tenantName"
                placeholder="예: 행복아파트"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">이름</Label>
              <Input id="name" name="name" placeholder="예: 김소장" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">이메일 (로그인 ID)</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">비밀번호 (8자 이상)</Label>
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
              <Label htmlFor="confirm">비밀번호 확인</Label>
              <Input
                id="confirm"
                name="confirm"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>
            {/* 동의는 신뢰 경계인 서버 액션이 다시 검사한다 — required는 편의일 뿐 */}
            <div className="space-y-2 rounded-md border border-gray-100 bg-gray-50/60 p-3">
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  name="terms"
                  required
                  className="mt-0.5 size-4 accent-primary"
                />
                <span>
                  <Link
                    href="/terms"
                    target="_blank"
                    className="font-semibold text-primary underline underline-offset-2"
                  >
                    이용약관
                  </Link>
                  에 동의합니다{" "}
                  <span className="text-muted-foreground">(필수)</span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  name="privacy"
                  required
                  className="mt-0.5 size-4 accent-primary"
                />
                <span>
                  <Link
                    href="/privacy"
                    target="_blank"
                    className="font-semibold text-primary underline underline-offset-2"
                  >
                    개인정보 수집·이용
                  </Link>
                  에 동의합니다{" "}
                  <span className="text-muted-foreground">(필수)</span>
                </span>
              </label>
            </div>
            {state?.error && (
              <p className="text-sm text-destructive">{state.error}</p>
            )}
            <Button type="submit" size="lg" className="w-full" disabled={pending}>
              {pending ? "만드는 중..." : "가입하고 시작하기"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              이미 계정이 있으신가요?{" "}
              <Link
                href="/login"
                className="font-semibold text-primary hover:underline"
              >
                로그인
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
