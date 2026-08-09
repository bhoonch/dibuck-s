# 디벅 (dibuck-s)

아파트 관리사무소 셀프서비스 SaaS — AI 문서 행정(공지문·기안결재·안전교육일지·미납독촉·법정점검). 제품 규칙은 `AGENTS.md`.

```bash
npm run dev          # 개발 서버
npx prisma db push   # 스키마 반영 (migrate dev 금지 — DB 리셋을 요구한다)
npx tsx smoke.ts     # 스모크
```

## 배포 체크리스트

배포하는 날 이 목록을 위에서부터 전부 확인한다. 하나라도 빠지면 해당 기능이 조용히 꺼진다.

1. **크론 활성화** — `.github/workflows/cron.yml`의 `schedule:` 주석을 해제하고 리포지토리 시크릿에 `APP_URL`·`CRON_SECRET` 등록. **안 하면 자동 청구·점검 예고·교육 예고가 전부 침묵한다** (수동 `workflow_dispatch`만 가능한 상태가 기본값).
2. **환경변수** — 없으면 화면이 "준비 중"으로 분기되는 것들:
   - `DATABASE_URL`, `AUTH_SECRET`, `APP_URL`
   - `ANTHROPIC_API_KEY` — AI 초안 생성 (공지문·기안·교육일지)
   - `TOSS_SECRET_KEY` + `NEXT_PUBLIC_TOSS_CLIENT_KEY` — 결제
   - `SMTP_HOST`·`SMTP_PORT`·`SMTP_SECURE`·`SMTP_USER`·`SMTP_PASS`·`SMTP_FROM` — 비밀번호 재설정·예고 메일
   - `KAKAO_REST_API_KEY` + `KAKAO_CLIENT_SECRET` — 카카오 로그인
   - `CRON_SECRET` — 크론 라우트 Bearer 인증 (1번과 같은 값)
3. **DB** — `npx prisma db push` 후 앱 재시작. 신규 DB면 `npx prisma db seed`(모듈 레지스트리 필수).
4. **가입 이메일 인증** — 현재 의도적으로 없음(`signup/actions.ts`). 실결제가 붙는 시점에 재검토.
