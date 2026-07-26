"use client";

import { useActionState, useState } from "react";
import { KeyRound, UserPlus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { roleLabels } from "@/lib/labels";
import { TempPasswordNotice } from "@/components/temp-password-notice";
import { adminAddStaff, adminResetPassword } from "../../actions";
import {
  Pill,
  Section,
  btnOutline,
  btnPrimary,
  btnRow,
  btnRowPrimary,
} from "../../ui";

type Staff = {
  id: string;
  name: string;
  email: string;
  title: string | null;
  role: string;
};

const select =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function StaffManager({
  tenantId,
  staff,
}: {
  tenantId: string;
  staff: Staff[];
}) {
  const [adding, setAdding] = useState(staff.length === 0);
  const [addState, addAction] = useActionState(adminAddStaff, undefined);
  const [resetState, resetAction] = useActionState(adminResetPassword, undefined);

  return (
    <Section
      title="직원 계정"
      meta={`${staff.length}명`}
      action={
        !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className={btnRowPrimary}
          >
            <UserPlus className="size-3.5" /> 계정 발급
          </button>
        )
      }
    >
      {staff.length === 0 && !adding ? (
        <p className="p-4 text-sm text-gray-500">등록된 직원이 없습니다.</p>
      ) : (
        staff.map((u) => (
          <div
            key={u.id}
            className="flex items-center gap-2.5 border-b border-gray-100 px-4 py-2.5"
          >
            <span className="text-sm font-medium">{u.name}</span>
            <Pill tone="muted">
              {u.title ?? roleLabels[u.role as keyof typeof roleLabels]}
            </Pill>
            <span className="min-w-0 flex-1 truncate font-mono text-xs text-gray-500">
              {u.email}
            </span>
            <form
              action={resetAction}
              onSubmit={(e) => {
                if (
                  !confirm(
                    `${u.name}의 비밀번호를 재설정할까요?\n기존 비밀번호는 즉시 사용할 수 없게 됩니다.`,
                  )
                )
                  e.preventDefault();
              }}
            >
              <input type="hidden" name="userId" value={u.id} />
              <button type="submit" className={btnRow} title="임시 비밀번호 발급">
                <KeyRound className="size-3.5" /> 비밀번호 재설정
              </button>
            </form>
          </div>
        ))
      )}

      <div className="space-y-3 p-4">
        <TempPasswordNotice state={resetState} />
        <TempPasswordNotice state={addState} />

        {adding && (
          <form action={addAction} className="space-y-3 rounded-lg border p-3">
            <input type="hidden" name="tenantId" value={tenantId} />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="staff-name">이름</Label>
                <Input id="staff-name" name="name" placeholder="김소장" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="staff-email">이메일 (로그인 ID)</Label>
                <Input
                  id="staff-email"
                  name="email"
                  type="email"
                  placeholder="manager@example.com"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="staff-role">권한</Label>
                <select id="staff-role" name="role" className={select}>
                  <option value="DIRECTOR">소장</option>
                  <option value="ACCOUNTANT">경리</option>
                  <option value="STAFF">직원</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="staff-title">직책 (선택)</Label>
                <Input id="staff-title" name="title" placeholder="관리소장" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              임시 비밀번호가 자동으로 만들어져 이 화면에 표시됩니다.
            </p>
            <div className="flex items-center gap-2">
              <button type="submit" className={btnPrimary}>
                계정 발급
              </button>
              <button
                type="button"
                onClick={() => setAdding(false)}
                className={btnOutline}
              >
                닫기
              </button>
            </div>
          </form>
        )}
      </div>
    </Section>
  );
}
