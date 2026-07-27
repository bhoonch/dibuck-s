import { LoginForm } from "./login-form";

const SUSPENDED_MSG =
  "이용이 중지된 단지입니다. 디벅 운영팀(support@dibuck.kr)으로 문의해 주세요.";

const loginErrors: Record<string, string> = {
  kakao_no_account:
    "카카오 계정과 연결된 디벅 계정이 없습니다. 가입 시 등록한 이메일과 카카오 이메일이 같아야 합니다.",
  kakao_failed: "카카오 로그인에 실패했습니다. 다시 시도해 주세요.",
  kakao_suspended: SUSPENDED_MSG,
  suspended: SUSPENDED_MSG,
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <LoginForm
      kakaoEnabled={!!process.env.KAKAO_REST_API_KEY}
      kakaoError={error ? loginErrors[error] : undefined}
    />
  );
}
