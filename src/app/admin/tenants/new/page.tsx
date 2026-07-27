import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createTenant } from "../../actions";
import { PageTitle, btnOutline, btnSubmit } from "../../ui";
import { requireAdmin } from "@/lib/auth";

export default async function AdminNewTenantPage() {
  await requireAdmin();
  return (
    <>
      <PageTitle
        title="단지 등록"
        description="가입한 단지를 콘솔에서 직접 추가합니다. 직원 계정과 모듈 구독은 등록 후 상세 화면에서 설정합니다."
      />
      <form action={createTenant} className="max-w-2xl space-y-4">
        <div className="grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="name">단지명</Label>
            <Input id="name" name="name" placeholder="예: 행복아파트" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="households">세대수</Label>
            <Input
              id="households"
              name="households"
              type="number"
              min={1}
              placeholder="예: 480"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="address">주소</Label>
            <Input
              id="address"
              name="address"
              placeholder="예: 서울시 행복구 행복로 123"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="buildingInfo">동 구성</Label>
            <Input
              id="buildingInfo"
              name="buildingInfo"
              placeholder="예: 101동~110동, 상가 1동"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="submit" className={btnSubmit}>
            단지 등록
          </button>
          <Link href="/admin/tenants" className={btnOutline}>
            취소
          </Link>
        </div>
      </form>
    </>
  );
}
