import { mailerEnabled } from "@/lib/mailer";
import { LoginForm } from "./login-form";

const SUSPENDED_MSG =
  "이용이 중지된 단지입니다. 디벅 운영팀(support@dibuck.kr)으로 문의해 주세요.";

const loginErrors: Record<string, string> = {
  // 셀프서비스다 — 계정이 없는 사람을 막다른 길에 세우지 말고 가입으로 보낸다
  kakao_no_account:
    "카카오 계정과 연결된 디벅 계정이 없습니다. 가입할 때 쓴 이메일과 카카오 이메일이 같아야 연결됩니다. 디벅이 처음이시면 아래 '무료로 시작하기'로 가입해 주세요.",
  kakao_failed: "카카오 로그인에 실패했습니다. 다시 시도해 주세요.",
  kakao_suspended: SUSPENDED_MSG,
  suspended: SUSPENDED_MSG,
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; reset?: string }>;
}) {
  const { error, reset } = await searchParams;
  return (
    <LoginForm
      kakaoEnabled={!!process.env.KAKAO_REST_API_KEY}
      resetEnabled={mailerEnabled()}
      kakaoError={error ? loginErrors[error] : undefined}
      notice={
        reset ? "비밀번호를 변경했습니다. 새 비밀번호로 로그인해 주세요." : undefined
      }
    />
  );
}
