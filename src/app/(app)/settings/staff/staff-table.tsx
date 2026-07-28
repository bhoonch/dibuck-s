"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import { KeyRound, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Role } from "@/generated/prisma/enums";
import { assignableRoles, roleLabels } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TempPasswordNotice } from "@/components/temp-password-notice";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  addStaff,
  directorResetStaffPassword,
  removeStaff,
  updateStaffRole,
} from "../actions";

type StaffRow = {
  id: string;
  name: string;
  title: string | null;
  email: string;
  role: Role;
};

export function StaffTable({
  staff,
  myUserId,
  isDirector,
}: {
  staff: StaffRow[];
  myUserId: string;
  isDirector: boolean;
}) {
  const [, startTransition] = useTransition();
  const [addState, addAction, addPending] = useActionState(addStaff, undefined);
  const [resetState, resetAction] = useActionState(
    directorResetStaffPassword,
    undefined,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (addState?.success) {
      formRef.current?.reset();
      toast.success("직원이 추가되었습니다.");
    }
  }, [addState]);

  const run = (fn: () => Promise<void>, ok: string) =>
    startTransition(async () => {
      try {
        await fn();
        toast.success(ok);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "실패했습니다.");
      }
    });

  return (
    <div className="space-y-8">
      <TempPasswordNotice state={resetState} />
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-gray-200 bg-gray-50 hover:bg-gray-50">
              {["이름", "직책", "이메일", "권한"].map((h) => (
                <TableHead
                  key={h}
                  className="text-xs font-semibold uppercase tracking-wider text-gray-500"
                >
                  {h}
                </TableHead>
              ))}
              {isDirector && <TableHead className="w-12" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {staff.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">
                  {u.name}
                  {u.id === myUserId && (
                    <Badge variant="secondary" className="ml-2">
                      나
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {u.title ?? "-"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {u.email}
                </TableCell>
                <TableCell>
                  {isDirector && u.id !== myUserId ? (
                    <select
                      defaultValue={u.role}
                      className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
                      onChange={(e) =>
                        run(
                          () => updateStaffRole(u.id, e.target.value as Role),
                          "역할이 변경되었습니다.",
                        )
                      }
                    >
                      {assignableRoles.map((r) => (
                        <option key={r} value={r}>
                          {roleLabels[r]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    roleLabels[u.role]
                  )}
                </TableCell>
                {isDirector && (
                  <TableCell>
                    {u.id !== myUserId && (
                      <span className="flex items-center gap-1">
                        <form
                          action={resetAction}
                          onSubmit={(e) => {
                            if (
                              !confirm(
                                `${u.name} 님의 비밀번호를 재설정할까요?\n기존 비밀번호는 즉시 사용할 수 없게 됩니다.`,
                              )
                            )
                              e.preventDefault();
                          }}
                        >
                          <input type="hidden" name="userId" value={u.id} />
                          <Button
                            type="submit"
                            variant="ghost"
                            size="icon"
                            aria-label="비밀번호 재설정"
                            title="임시 비밀번호 발급"
                          >
                            <KeyRound className="size-4 text-gray-500" />
                          </Button>
                        </form>
                        <ConfirmDialog
                          trigger={
                            <Button variant="ghost" size="icon" aria-label="삭제">
                              <Trash2 className="size-4 text-destructive" />
                            </Button>
                          }
                          title={`${u.name} 님을 삭제할까요?`}
                          description="삭제하면 더 이상 로그인할 수 없습니다. 작성한 문서는 남아 있습니다."
                          confirmLabel="삭제"
                          destructive
                          onConfirm={() =>
                            run(() => removeStaff(u.id), "삭제되었습니다.")
                          }
                        />
                      </span>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {isDirector && (
        <form
          ref={formRef}
          action={addAction}
          className="max-w-2xl rounded-lg border bg-card"
        >
          <div className="border-b border-gray-100 px-4 py-3">
            <h2 className="text-lg font-semibold tracking-tight">직원 추가</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              추가된 직원은 임시 비밀번호로 바로 로그인할 수 있습니다.
            </p>
          </div>
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="staff-name">이름</Label>
              <Input id="staff-name" name="name" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="staff-title">직책</Label>
              <Input
                id="staff-title"
                name="title"
                placeholder="예: 과장, 전기과장, 경비반장"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="staff-email">이메일</Label>
              <Input id="staff-email" name="email" type="email" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="staff-role">권한</Label>
              <select
                id="staff-role"
                name="role"
                defaultValue="STAFF"
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                {assignableRoles.map((r) => (
                  <option key={r} value={r}>
                    {roleLabels[r]}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                위 권한 안내를 참고하세요. 직책과는 무관합니다.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="staff-password">임시 비밀번호 (8자 이상)</Label>
              <Input
                id="staff-password"
                name="password"
                type="text"
                minLength={8}
                required
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-3 border-t border-gray-100 px-4 py-3">
            {addState?.error && (
              <p className="text-sm text-destructive">{addState.error}</p>
            )}
            <Button type="submit" size="lg" disabled={addPending}>
              {addPending ? "추가 중..." : "직원 추가"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
