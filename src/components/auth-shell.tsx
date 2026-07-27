import Link from "next/link";
import { Building2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/** 로그인 밖 인증 화면(비밀번호 재설정 등)의 공통 껍데기 — 로고 + 카드 + 로그인 링크 */
export function AuthShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-4">
      <div className="flex items-center gap-2 text-primary">
        <Building2 className="size-8" />
        <span className="text-2xl font-bold">디벅</span>
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent className="space-y-4">{children}</CardContent>
      </Card>
      <Link
        href="/login"
        className="text-sm font-semibold text-primary hover:underline"
      >
        로그인으로 돌아가기
      </Link>
    </main>
  );
}
