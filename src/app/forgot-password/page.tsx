import { mailerEnabled } from "@/lib/mailer";
import { AuthShell } from "@/components/auth-shell";
import { ForgotPasswordForm } from "./forgot-password-form";

export default function ForgotPasswordPage() {
  // 발송 인프라가 꺼져 있으면 폼을 보여주지 않는다 — 눌러도 메일이 안 오는 화면이 최악이다
  if (!mailerEnabled())
    return (
      <AuthShell title="비밀번호 재설정">
        <p className="text-sm text-muted-foreground">
          메일 발송이 아직 설정되지 않았습니다.
        </p>
        <p className="text-sm text-muted-foreground">
          같은 단지 <b className="text-foreground">마스터 권한</b>을 가진 분께
          요청하시면 설정 &gt; 직원 관리에서 임시 비밀번호를 발급해 드릴 수
          있습니다. 본인이 마스터라면 디벅 운영팀(support@dibuck.kr)으로 문의해
          주세요.
        </p>
      </AuthShell>
    );

  return (
    <AuthShell title="비밀번호 재설정">
      <ForgotPasswordForm />
    </AuthShell>
  );
}
