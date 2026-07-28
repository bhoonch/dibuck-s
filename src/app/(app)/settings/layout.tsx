import { PageHeader } from "@/components/ui/page-header";
import { SettingsNav } from "./settings-nav";

/**
 * 폭을 여기서 한 번만 정한다 — 예전엔 하위 7개 페이지가 저마다 max-w를 들고 있어
 * (672·768·896·944·무제한) 탭을 옮길 때마다 카드 좌우 끝이 튀었다.
 */
export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="max-w-[1100px]">
      <PageHeader
        title="단지·계정 관리"
        description="단지 정보와 직원, 구독과 결제를 관리합니다."
      />
      <div className="grid items-start gap-6 lg:grid-cols-[11rem_minmax(0,1fr)]">
        <SettingsNav />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
