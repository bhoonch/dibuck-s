# 디벅은 셀프서비스 SaaS다

아파트 관리사무소가 직접 가입하고, 직접 결제하고, 직접 쓰는 구독형 서비스다.
영업이 붙어 세팅해 주는 B2B 납품이 아니다. 그래서:

- 모든 흐름은 **운영자 개입 없이 사용자 혼자** 끝나야 한다 — 가입·단지 등록·모듈 구독·결제·해지.
- "담당자에게 문의하세요", "전화 주세요" 같은 출구를 만들지 않는다. 막히면 앱 안에서 풀린다.
- 문의도 앱 안에서 접수하고 앱 안에서 답한다(`/support`).

# 아래 규칙은 전부 실제로 났던 버그다

- **돈·상태를 바꾸는 함수는 "지금 할 차례인가"를 자기 입구에서 검사한다.** 호출자에게 맡긴 검사는 새 호출자가 생기는 순간 없는 것이 된다 — `chargeTenant`가 도래 판정을 크론에만 두어, 카드 변경 콜백과 "지금 결제하기"가 이미 결제한 기간을 다시 결제했다.
- **한 번만 일어나야 하는 일은 조건부 `updateMany`로 자리를 잡고 시작한다.** 읽고-검사하고-쓰면 동시에 들어온 두 요청이 같은 검사를 통과한다(결제 진입, 상신 채번).
- **`{ not: x }`는 NULL 행을 제외한다.** SQL 삼치논리라 Prisma도 같다 — 외부 결재자 스텝은 `userId`가 null이라 조용히 빠진다. `OR: [{ userId: null }, { userId: { not: x } }]`로 쓸 것.
- **트랜잭션 안에서 행마다 쿼리를 도는 루프를 쓰지 않는다.** 기본 타임아웃 5초다. 세대 명부 upsert 루프가 "2만 세대까지 등록"이라는 안내를 거짓말로 만들었다 — `deleteMany` + `createMany` 두 번이면 끝난다.
- **크론 라우트는 GET·POST를 둘 다 export한다.** Vercel Cron과 curl 기본값은 GET이라, POST만 열면 매일 405만 나며 배치가 조용히 멈춘다.
- **동작을 바꾸면 문구·주석도 같은 커밋에서 고친다.** 안 고치면 다음 사람이 거짓 설명을 읽고 판단한다.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
