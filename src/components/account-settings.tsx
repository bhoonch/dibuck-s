"use client";

import { useActionState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  changeMyPassword,
  deleteMyTenant,
  updateMyProfile,
} from "@/app/account/actions";

function Feedback({
  state,
  successText,
}: {
  state: { error?: string; success?: boolean } | undefined;
  successText: string;
}) {
  if (!state) return null;
  if (state.error)
    return <p className="text-sm text-destructive">{state.error}</p>;
  return <p className="text-sm text-success">{successText}</p>;
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold tracking-wider text-gray-400 uppercase">
        {label}
      </dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}

/** 내 계정 설정 — 사용자 설정 탭과 관리자 콘솔이 공용으로 사용 */
export function AccountSettings({
  name,
  title,
  email,
  roleLabel,
  showTitle,
  tenantName,
}: {
  name: string;
  title: string | null;
  email: string;
  roleLabel: string;
  /** 직책은 단지 직원에게만 의미 있음 — 운영자 화면에서는 숨김 */
  showTitle: boolean;
  /** 탈퇴는 단지 단위라 소장만 — 운영자·직원 화면에서는 숨김 */
  tenantName?: string;
}) {
  const [profileState, profileAction] = useActionState(updateMyProfile, undefined);
  const [pwState, pwAction] = useActionState(changeMyPassword, undefined);
  const [leaveState, leaveAction] = useActionState(deleteMyTenant, undefined);

  return (
    <div className="space-y-6">
      {/* 지금 로그인한 사람이 누구인지 — 고칠 수 없는 값은 폼이 아니라 여기에 */}
      <Card className="p-4">
        {/* 오른쪽 정렬이되 카드 끝에 딱 붙지는 않게 여백을 더 준다 */}
        <div className="flex flex-wrap items-center gap-4 sm:pr-10">
          <span className="flex size-11 items-center justify-center rounded-full bg-accent text-lg font-semibold text-accent-foreground">
            {name.slice(0, 1)}
          </span>
          <div>
            <p className="font-semibold">{name}</p>
            {/* 직책(자유 텍스트)과 권한(등급)은 다른 값이라 한 줄에 같이 보인다 */}
            <p className="text-sm text-muted-foreground">
              {title ? `${title} · ${roleLabel} 권한` : `${roleLabel} 권한`}
            </p>
          </div>
          <dl className="flex flex-wrap gap-x-8 gap-y-3 sm:ml-auto">
            <Meta label="로그인 이메일" value={email} />
            {tenantName && <Meta label="소속 단지" value={tenantName} />}
          </dl>
        </div>
      </Card>

      <section>
        <h2 className="mb-3 text-lg font-semibold tracking-tight">내 정보</h2>
        <form action={profileAction}>
          <Card className="p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="my-name">이름</Label>
                <Input id="my-name" name="name" defaultValue={name} required />
              </div>
              {showTitle && (
                <div className="space-y-2">
                  <Label htmlFor="my-title">직책 (선택)</Label>
                  <Input
                    id="my-title"
                    name="title"
                    defaultValue={title ?? ""}
                    placeholder="예: 관리소장, 경리주임"
                  />
                  <p className="text-xs text-muted-foreground">
                    결재란과 문서 명의에 그대로 찍힙니다.
                  </p>
                </div>
              )}
            </div>
            <Feedback state={profileState} successText="저장했습니다." />
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" size="lg">
                저장
              </Button>
              <p className="text-sm text-muted-foreground">
                이메일은 로그인 아이디라 바꿀 수 없습니다.
              </p>
            </div>
          </Card>
        </form>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold tracking-tight">
          비밀번호 변경
        </h2>
        <form action={pwAction}>
          <Card className="p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2 sm:max-w-sm">
                <Label htmlFor="pw-current">현재 비밀번호</Label>
                <Input
                  id="pw-current"
                  name="current"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pw-next">새 비밀번호 (8자 이상)</Label>
                <Input
                  id="pw-next"
                  name="next"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pw-confirm">새 비밀번호 확인</Label>
                <Input
                  id="pw-confirm"
                  name="confirm"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </div>
            </div>
            <Feedback state={pwState} successText="비밀번호를 변경했습니다." />
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" size="lg">
                변경
              </Button>
              <p className="text-sm text-muted-foreground">
                이 기기는 그대로 두고, 다른 기기의 로그인만 모두 풀립니다.
              </p>
            </div>
          </Card>
        </form>
      </section>

      {tenantName && (
        // 평소엔 한 줄로 접어 둔다 — 상시 노출할 만큼 자주 쓰는 기능이 아니다
        <details className="group overflow-hidden rounded-lg border bg-card">
          <summary className="flex cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden">
            <span>
              <span className="block text-sm font-semibold">서비스 탈퇴</span>
              <span className="block text-sm text-muted-foreground">
                단지와 모든 데이터(문서·세대·직원 계정·문의)를 즉시 삭제합니다.
                되돌릴 수 없습니다.
              </span>
            </span>
            <ChevronDown className="ml-auto size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <form
            action={leaveAction}
            className="space-y-4 border-t border-gray-100 p-4"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="leave-name">
                  확인을 위해 단지명 입력 ({tenantName})
                </Label>
                <Input
                  id="leave-name"
                  name="confirmName"
                  placeholder={tenantName}
                  autoComplete="off"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="leave-password">현재 비밀번호</Label>
                <Input
                  id="leave-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </div>
            </div>
            <Feedback state={leaveState} successText="" />
            <Button type="submit" size="lg" variant="destructive">
              탈퇴하고 모든 데이터 삭제
            </Button>
          </form>
        </details>
      )}
    </div>
  );
}
