"use client";

import { useState } from "react";
import { ChevronRight, PenLine } from "lucide-react";
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
import { saveApprovalLine } from "../actions";

export type StaffOption = {
  id: string;
  name: string;
  label: string; // 직책 또는 권한
};

export type ExternalApproverInput = {
  role: "CHAIR" | "AUDITOR" | "ETC";
  label?: string; // ETC의 역할명 (예: 이사, 동대표)
  name: string;
  phone?: string;
  email?: string;
};

// 회장·감사는 규칙 엔진이 문서 성격에 따라 결재선에 자동 추가하는 고정 슬롯 — 삭제 불가.
// 그 외 위원(이사·동대표 등)은 자유롭게 추가하고 상신 시 수동으로 결재선에 넣는다.
const FIXED_ROLES: {
  role: "CHAIR" | "AUDITOR";
  label: string;
  hint: string;
}[] = [
  {
    role: "CHAIR",
    label: "입주자대표회장",
    hint: "지출 품의부터 결재선 끝에 자동 추가",
  },
  {
    role: "AUDITOR",
    label: "감사",
    hint: "장기수선충당금 공사 결재에 자동 추가",
  },
];

function StepCard({
  step,
  person,
}: {
  step: string;
  person?: { name: string; label: string } | null;
}) {
  return (
    <div
      className={`flex w-36 shrink-0 flex-col items-center gap-1.5 rounded-lg border px-3 py-4 text-center ${
        person ? "bg-card" : "border-dashed bg-background"
      }`}
    >
      <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
        {step}
      </span>
      {person ? (
        <>
          <span className="flex size-9 items-center justify-center rounded-full bg-gray-800 text-sm font-semibold text-white">
            {person.name.charAt(0)}
          </span>
          <span className="text-sm font-semibold">{person.name}</span>
          <span className="text-xs text-gray-500">{person.label}</span>
        </>
      ) : (
        <>
          <span className="flex size-9 items-center justify-center rounded-full bg-gray-100 text-gray-300">
            <PenLine className="size-4" />
          </span>
          <span className="text-xs text-gray-400">
            결재자를
            <br />
            선택하세요
          </span>
        </>
      )}
    </div>
  );
}

const inputCls =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm";

function ExternalApprovers({
  initialExternal,
  isDirector,
}: {
  initialExternal: ExternalApproverInput[];
  isDirector: boolean;
}) {
  // 회장·감사 고정 슬롯을 항상 앞에 두고, 기타 위원은 뒤에 자유 추가
  const [rows, setRows] = useState<ExternalApproverInput[]>(() => [
    ...FIXED_ROLES.map(({ role }) => ({
      role,
      name: "",
      phone: "",
      email: "",
      ...initialExternal.find((e) => e.role === role),
    })),
    ...initialExternal.filter((e) => e.role === "ETC"),
  ]);
  const patch = (i: number, p: Partial<ExternalApproverInput>) =>
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...p } : r)));

  return (
    <div className="space-y-3 border-t border-gray-100 pt-4">
      {/* 저장은 서버 액션 폼 그대로 — 동적 목록이라 JSON 하나로 실어 보낸다 */}
      <input
        type="hidden"
        name="externalApprovers"
        value={JSON.stringify(rows)}
      />
      <div>
        <p className="text-sm font-semibold">외부 결재자 (입주자대표회의)</p>
        <p className="text-xs text-muted-foreground">
          직원 계정 없이 이름과 연락처만 등록합니다. 회장·감사는 문서 성격에
          따라 결재선 뒤에 자동으로 추가되고, 결재는 문자·이메일 서명 링크로
          받습니다.
        </p>
      </div>
      {rows.map((row, i) => {
        const fixed = FIXED_ROLES.find((f) => f.role === row.role);
        return (
          <div key={i} className="space-y-2 rounded-lg border bg-background p-3">
            <div className="flex items-center justify-between gap-2">
              {fixed ? (
                <p className="text-sm font-medium">
                  {fixed.label}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {fixed.hint}
                  </span>
                </p>
              ) : (
                <input
                  value={row.label ?? ""}
                  placeholder="역할 (예: 이사, 동대표)"
                  disabled={!isDirector}
                  onChange={(e) => patch(i, { label: e.target.value })}
                  className={`${inputCls} max-w-48`}
                />
              )}
              {!fixed && isDirector && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setRows((prev) => prev.filter((_, j) => j !== i))
                  }
                >
                  삭제
                </Button>
              )}
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <input
                value={row.name}
                placeholder="이름"
                disabled={!isDirector}
                onChange={(e) => patch(i, { name: e.target.value })}
                className={inputCls}
              />
              <input
                value={row.phone ?? ""}
                placeholder="휴대전화 (선택)"
                disabled={!isDirector}
                onChange={(e) => patch(i, { phone: e.target.value })}
                className={inputCls}
              />
              <input
                type="email"
                value={row.email ?? ""}
                placeholder="이메일 (선택)"
                disabled={!isDirector}
                onChange={(e) => patch(i, { email: e.target.value })}
                className={inputCls}
              />
            </div>
          </div>
        );
      })}
      {isDirector && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            setRows((prev) => [
              ...prev,
              { role: "ETC", label: "", name: "", phone: "", email: "" },
            ])
          }
        >
          + 외부 결재자 추가
        </Button>
      )}
    </div>
  );
}

export function ApprovalLineEditor({
  staff,
  initialLine,
  initialExternal,
  initialDirectorLimit,
  initialDirectorLimitClause,
  isDirector,
}: {
  staff: StaffOption[];
  initialLine: string[];
  initialExternal: ExternalApproverInput[];
  /** 관리규약의 소장 전결 한도(VAT 제외, 원) */
  initialDirectorLimit: number | null;
  /** 전결 근거 조항 — 전결 문서의 관련근거에 인용된다 */
  initialDirectorLimitClause: string | null;
  isDirector: boolean;
}) {
  const [line, setLine] = useState<string[]>([
    initialLine[0] ?? "",
    initialLine[1] ?? "",
    initialLine[2] ?? "",
  ]);
  // 금액 칸은 천 단위 쉼표 — 서버는 parseWon()이 숫자만 뽑는다
  const [limit, setLimit] = useState(
    initialDirectorLimit ? initialDirectorLimit.toLocaleString("ko-KR") : "",
  );
  const byId = new Map(staff.map((s) => [s.id, s]));

  return (
    <form action={saveApprovalLine}>
      <Card className="gap-0 py-0">
        <CardHeader className="gap-0.5 border-b border-gray-100 px-4 py-3">
          <CardTitle>결재선</CardTitle>
          <CardDescription>
            문서를 올린 사람이 결재란 첫 칸(기안)에 서고, 그 뒤로 아래 순서대로
            승인을 받습니다. 기안자가 아래 명단에도 있으면 칸은 하나로 합쳐집니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 p-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <StepCard
              step="기안"
              person={{ name: "작성자", label: "문서를 올린 직원" }}
            />
            {line.map((id, i) => {
              const person = byId.get(id);
              return (
                <div key={i} className="flex items-center gap-2">
                  <ChevronRight className="size-5 shrink-0 text-gray-300" />
                  <StepCard
                    step={`${i + 1}차 결재`}
                    person={
                      person
                        ? { name: person.name, label: person.label }
                        : null
                    }
                  />
                </div>
              );
            })}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-2">
                <Label htmlFor={`approver${i + 1}`}>{i + 1}차 결재자</Label>
                <select
                  id={`approver${i + 1}`}
                  name={`approver${i + 1}`}
                  value={line[i]}
                  disabled={!isDirector}
                  onChange={(e) =>
                    setLine((prev) => {
                      const next = [...prev];
                      next[i] = e.target.value;
                      return next;
                    })
                  }
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                >
                  <option value="">없음</option>
                  {staff.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.label})
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <ExternalApprovers
            initialExternal={initialExternal}
            isDirector={isDirector}
          />

        </CardContent>
      </Card>

      {/*
        전결 규정은 결재선과 한 몸이다 — 둘 다 "이 문서가 누구에게 가느냐"를 정한다.
        메뉴를 나누면 두 화면을 오가며 맞춰야 하므로 같은 폼에 두되, 카드를 따로 세워
        위상을 맞춘다(결재선 카드 안 회색 글씨로 두니 안 읽혔다).
      */}
      <Card className="mt-6 gap-0 py-0">
        <CardHeader className="gap-0.5 border-b border-gray-100 px-4 py-3">
          <CardTitle>관리소장 전결 규정</CardTitle>
          <CardDescription>
            한도 이하이고 연간 예산에 반영된 지출은 회장 결재 없이 소장 결재로
            끝납니다. 비워 두면 지출 문서에 항상 회장이 붙습니다.
            <br />
            장기수선충당금은 한도와 무관하게 감사·회장 결재를 받습니다.
          </CardDescription>
        </CardHeader>
        {/*
          지금 적용 중인 규정을 문장으로 먼저 보여준다 — 값이 입력칸 안에만 있으면
          placeholder(예시)와 저장된 값이 같은 회색 글씨로 보여 구분이 안 된다.
        */}
        <div className="border-b border-gray-100 px-4 py-3 text-sm">
          {initialDirectorLimit ? (
            <>
              현재{" "}
              <b className="font-mono">
                {initialDirectorLimit.toLocaleString("ko-KR")}원
              </b>
              (VAT 제외) 이하이고 예산에 반영된 지출은{" "}
              <b>관리소장 전결</b>로 끝납니다
              {initialDirectorLimitClause
                ? ` — 근거: ${initialDirectorLimitClause}`
                : " (근거 조항 미등록: 문서에는 법령만 인용됩니다)"}
              .
            </>
          ) : (
            <span className="text-muted-foreground">
              전결 한도가 등록되지 않아 <b>모든 지출 문서에 회장 결재</b>가
              붙습니다. 관리규약의 한도를 아래에 등록해 주세요.
            </span>
          )}
        </div>
        <CardContent className="grid gap-4 p-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="directorLimit">전결 한도</Label>
            <div className="flex items-center gap-2">
              <Input
                id="directorLimit"
                name="directorLimit"
                inputMode="numeric"
                className="font-mono"
                placeholder="예: 3,000,000"
                value={limit}
                onChange={(e) => {
                  const n = e.target.value.replace(/[^0-9]/g, "");
                  setLimit(n ? Number(n).toLocaleString("ko-KR") : "");
                }}
                disabled={!isDirector}
              />
              <span className="shrink-0 text-sm text-muted-foreground">원</span>
            </div>
            <p className="text-xs text-muted-foreground">
              관리규약이 정한 금액입니다. VAT 제외 금액으로 비교합니다.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="directorLimitClause">전결 근거 조항</Label>
            <Input
              id="directorLimitClause"
              name="directorLimitClause"
              placeholder="예: 제38조(관리소장의 전결사항)"
              defaultValue={initialDirectorLimitClause ?? ""}
              disabled={!isDirector}
            />
            <p className="text-xs text-muted-foreground">
              전결 문서의 관련근거에 그대로 인용합니다. 비워 두면 법령만
              적습니다.
            </p>
          </div>
        </CardContent>
        {/* 두 카드가 한 폼이라 저장은 아래 한 번 — 결재선과 전결 규정이 같이 저장된다 */}
        <CardFooter className="justify-end border-t border-gray-100 px-4 py-3">
          {isDirector ? (
            <Button type="submit" size="lg">
              저장
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">
              결재선은 마스터만 수정할 수 있습니다.
            </p>
          )}
        </CardFooter>
      </Card>
    </form>
  );
}
