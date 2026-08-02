-- 가입 시 약관·개인정보 수집 동의 시각(증적). 셀프 가입자만 찍힌다.
ALTER TABLE "User" ADD COLUMN "termsAgreedAt" TIMESTAMP(3);
