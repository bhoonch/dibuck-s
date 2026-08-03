import { PageHeader } from "@/components/ui/page-header";
import { SavedToast } from "@/components/ui/saved-toast";
import { SettingsNav } from "./settings-nav";

/**
 * 폭을 여기서 한 번만 정한다 — 예전엔 하위 페이지가 저마다 max-w를 들고 있어
 * (672·768·896·944·무제한) 메뉴를 옮길 때마다 카드 좌우 끝이 튀었다.
 * 1280은 구독·결제 화면과 같은 값 — 두 화면을 오갈 때도 끝선이 안 움직인다.
 */
export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="max-w-[1280px]">
      {/* 설정 하위 화면의 저장 알림을 한 곳에서 — 각 페이지가 따로 들 필요가 없다 */}
      <SavedToast />
      <PageHeader
        title="단지 관리"
        description="단지 정보와 세대·직원, 결재 규정을 관리합니다."
      />
      <div className="space-y-6">
        <SettingsNav />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
