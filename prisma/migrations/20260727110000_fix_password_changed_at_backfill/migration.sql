-- passwordChangedAt 최초 백필이 DEFAULT CURRENT_TIMESTAMP로 들어갔는데,
-- timestamptz -> timestamp(3) 변환이 DB 세션 시간대(KST) 벽시계를 넣는다.
-- Prisma는 그 값을 UTC로 읽으므로 기존 사용자 전원의 passwordChangedAt이 9시간 미래가 되고,
-- "토큰 발급 시각 < 비밀번호 변경 시각" 검사에 걸려 전원 로그아웃된다.
-- Prisma가 UTC로 기록한 createdAt 기준으로 되돌린다.
-- (이 시점엔 아직 아무도 비밀번호를 바꾸지 않았으므로 조건에 걸리는 건 잘못된 백필뿐이다)
UPDATE "User" SET "passwordChangedAt" = "createdAt" WHERE "passwordChangedAt" > "createdAt";
