"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

const cardHeader = "gap-0.5 border-b border-gray-100 px-4 py-3";
const cardFooter = "justify-end border-t border-gray-100 bg-transparent px-4 py-3";

/** 내 계정 설정 — 사용자 설정 탭과 관리자 콘솔이 공용으로 사용 */
export function AccountSettings({
  name,
  title,
  email,
  showTitle,
  tenantName,
}: {
  name: string;
  title: string | null;
  email: string;
  /** 직책은 단지 직원에게만 의미 있음 — 운영자 화면에서는 숨김 */
  showTitle: boolean;
  /** 탈퇴는 단지 단위라 소장만 — 운영자·직원 화면에서는 숨김 */
  tenantName?: string;
}) {
  const [profileState, profileAction] = useActionState(updateMyProfile, undefined);
  const [pwState, pwAction] = useActionState(changeMyPassword, undefined);
  const [leaveState, leaveAction] = useActionState(deleteMyTenant, undefined);

  return (
    <div className="grid max-w-4xl items-start gap-6 lg:grid-cols-2">
      <form action={profileAction}>
        <Card className="gap-0 py-0">
          <CardHeader className={cardHeader}>
            <CardTitle className="text-lg tracking-tight">내 정보</CardTitle>
            <CardDescription>로그인 이메일: {email}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 p-4">
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
              </div>
            )}
            <Feedback state={profileState} successText="저장했습니다." />
          </CardContent>
          <CardFooter className={cardFooter}>
            <Button type="submit" size="lg">
              저장
            </Button>
          </CardFooter>
        </Card>
      </form>

      <form action={pwAction}>
        <Card className="gap-0 py-0">
          <CardHeader className={cardHeader}>
            <CardTitle className="text-lg tracking-tight">비밀번호 변경</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-4">
            <div className="space-y-2">
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
            <Feedback state={pwState} successText="비밀번호를 변경했습니다." />
          </CardContent>
          <CardFooter className={cardFooter}>
            <Button type="submit" size="lg">
              변경
            </Button>
          </CardFooter>
        </Card>
      </form>

      {tenantName && (
        <form action={leaveAction} className="lg:col-span-2">
          <Card className="gap-0 border-destructive/40 py-0">
            <CardHeader className={cardHeader}>
              <CardTitle className="text-lg tracking-tight text-destructive">
                서비스 탈퇴
              </CardTitle>
              <CardDescription>
                단지와 모든 데이터(문서·세대·직원 계정·문의)를 즉시 삭제합니다. 되돌릴 수
                없습니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 p-4 sm:grid-cols-2">
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
              <div className="sm:col-span-2">
                <Feedback state={leaveState} successText="" />
              </div>
            </CardContent>
            <CardFooter className={cardFooter}>
              <Button type="submit" size="lg" variant="destructive">
                탈퇴하고 모든 데이터 삭제
              </Button>
            </CardFooter>
          </Card>
        </form>
      )}
    </div>
  );
}
