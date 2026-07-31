import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 구독·결제를 설정 서랍에서 메인 메뉴로 꺼내며 주소가 바뀌었다. 이미 나간
  // 메일(체험 종료·결제 실패 안내)의 버튼이 옛 주소를 들고 있으므로 계속 받는다.
  // 쿼리(?registered=1 등)는 그대로 따라온다.
  redirects: async () => [
    { source: "/settings/subscriptions", destination: "/subscriptions", permanent: true },
    { source: "/settings/billing", destination: "/billing", permanent: true },
    // 모듈 런처는 구독 화면과 같은 그리드를 버튼만 빼고 그리고 있어 합쳤다.
    // 하위 경로(/modules/approvals 등)는 그대로 — source가 정확히 일치할 때만 탄다.
    { source: "/modules", destination: "/subscriptions", permanent: true },
    // 내 계정은 단지 서랍에서 나와 프로필 칩의 자리(/account)가 됐다
    { source: "/settings/account", destination: "/account", permanent: true },
  ],
  experimental: {
    serverActions: {
      // 서버 액션 body 기본 한도는 1MB — 세대 명부 엑셀(5MB 약속)과
      // 견적서 첨부(3MB)가 그보다 크다. multipart 오버헤드 여유까지 6MB.
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
