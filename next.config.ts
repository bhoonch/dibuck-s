import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // 서버 액션 body 기본 한도는 1MB — 세대 명부 엑셀(5MB 약속)과
      // 견적서 첨부(3MB)가 그보다 크다. multipart 오버헤드 여유까지 6MB.
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
