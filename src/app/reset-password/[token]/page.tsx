import Link from "next/link";
import { db } from "@/lib/db";
import { RESET_STATE_MESSAGE, resetTokenState } from "@/lib/password-reset";
import { AuthShell } from "@/components/auth-shell";
import { ResetPasswordForm } from "./reset-password-form";

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const record = await db.passwordReset.findUnique({
    where: { token },
    select: { expiresAt: true, usedAt: true, user: { select: { email: true } } },
  });
  const state = resetTokenState(record);

  if (state !== "valid")
    return (
      <AuthShell title="비밀번호 재설정">
        <p className="text-sm text-destructive">{RESET_STATE_MESSAGE[state]}</p>
        <Link
          href="/forgot-password"
          className="inline-block text-sm font-semibold text-primary hover:underline"
        >
          재설정 다시 요청하기
        </Link>
      </AuthShell>
    );

  return (
    <AuthShell title="새 비밀번호 설정" description={record!.user.email}>
      <ResetPasswordForm token={token} />
    </AuthShell>
  );
}
