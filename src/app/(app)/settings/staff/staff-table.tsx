"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { KeyRound, Search, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import type { Role } from "@/generated/prisma/enums";
import { assignableRoles, roleLabels } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  const [query, setQuery] = useState("");
  // 다이얼로그는 Radix가 상태를 들고, 성공 시 숨은 닫기 버튼을 눌러 닫는다 —
  // 효과 안에서 setState를 부르면 렌더가 연쇄된다(React Compiler 규칙)
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (addState?.success) {
      formRef.current?.reset();
      closeRef.current?.click(); // 성공하면 닫는다 — 실패면 열어 둬야 오류 문구가 보인다
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

  // 직원 목록은 손으로 짠 표다(행마다 권한 셀렉트·버튼이 있어 DataTable로 안 옮겼다).
  // 검색은 여기서 직접 — 이름·직책·이메일만 훑는다
  const q = query.trim().toLowerCase();
  const rows = q
    ? staff.filter((u) =>
        [u.name, u.title ?? "", u.email].some((v) =>
          v.toLowerCase().includes(q),
        ),
      )
    : staff;

  return (
    <div className="space-y-8">
      <TempPasswordNotice state={resetState} />
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-9 max-w-sm flex-1 items-center gap-2 rounded-md border bg-card px-2.5">
            <Search className="size-4 shrink-0 text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="이름·직책·이메일 검색"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="text-xs text-gray-500 hover:text-foreground"
              >
                지우기
              </button>
            )}
          </div>
          {isDirector && (
            <Dialog>
              <DialogTrigger asChild>
                <Button size="lg">
                  <UserPlus className="size-4" /> 직원 추가
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle>직원 추가</DialogTitle>
                  <DialogDescription>
                    추가된 직원은 임시 비밀번호로 바로 로그인할 수 있습니다.
                  </DialogDescription>
                </DialogHeader>
                <form ref={formRef} action={addAction}>
                  <div className="grid gap-4 sm:grid-cols-2">
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
                      <Input
                        id="staff-email"
                        name="email"
                        type="email"
                        required
                      />
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
                        권한 안내는 이 화면 위쪽에 있습니다. 직책과는
                        무관합니다.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="staff-password">
                        임시 비밀번호 (8자 이상)
                      </Label>
                      <Input
                        id="staff-password"
                        name="password"
                        type="text"
                        minLength={8}
                        required
                      />
                    </div>
                  </div>
                  <div className="mt-5 flex items-center justify-end gap-3">
                    {addState?.error && (
                      <p className="text-sm text-destructive">
                        {addState.error}
                      </p>
                    )}
                    <Button type="submit" size="lg" disabled={addPending}>
                      {addPending ? "추가 중..." : "직원 추가"}
                    </Button>
                  </div>
                  {/* 성공했을 때 효과에서 눌러 닫는다 — 상태를 하나 더 들지 않기 위해 */}
                  <DialogClose ref={closeRef} className="hidden" />
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
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
              {rows.map((u) => (
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
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label="삭제"
                              >
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
      </div>
    </div>
  );
}
