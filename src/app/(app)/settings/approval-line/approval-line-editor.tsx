"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Copy, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { SummaryBox } from "@/components/ui/summary-box";
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
  /** 상시 열람 링크 토큰 — 서버가 발급한다. 비운 채로 저장하면 새로 발급된다(=옛 링크 무효) */
  token?: string;
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

/**
 * 외부 결재자의 상시 결재함 링크. 문서별 서명 링크(7일 만료)와 달리 만료가 없어서,
 * 회장이 지난 결재 건을 다시 볼 수 있는 유일한 경로다 — 한 번 전달해 두면 계속 쓴다.
 * 주소 전문은 보여주지 않는다 — 좁은 설정 카드에서 잘린 URL은 읽을 수 없고,
 * 확인은 "열어보기"가, 전달은 "복사"가 한다(절대 주소는 누를 때 만든다).
 */
function InboxLink({
  token,
  isDirector,
  onReissue,
}: {
  token: string;
  isDirector: boolean;
  onReissue: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const path = `/approve/inbox/${token}`;

  return (
    <div className="mt-1 flex flex-wrap items-center gap-2">
      <a
        href={path}
        target="_blank"
        rel="noreferrer"
        className="text-xs text-muted-foreground underline underline-offset-2"
      >
        결재함 열어보기
      </a>
      <Button
        type="button"
        variant="outline"
        size="xs"
        onClick={() => {
          navigator.clipboard.writeText(`${window.location.origin}${path}`);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        <Copy className="size-3" />
        {copied ? "복사됨!" : "결재함 링크 복사"}
      </Button>
      {isDirector && (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="text-muted-foreground"
          onClick={onReissue}
          /* 실제 무효화는 저장 시점 — 버튼만 누르고 나가면 옛 링크가 그대로 산다 */
          title="저장하면 새 링크가 발급되고 지금 링크는 열리지 않습니다"
        >
          새로 발급
        </Button>
      )}
    </div>
  );
}

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

  // 저장 전 입력까지 바로 비치도록 rows에서 뽑는다 — 서버가 준 initialExternal이 아니라
  // 인덱스를 먼저 붙이고 거른다 — 걸러낸 뒤의 순번으로 patch를 부르면 엉뚱한 줄이 바뀐다
  const registered = rows
    .map((r, i) => ({
      i,
      roleLabel:
        FIXED_ROLES.find((f) => f.role === r.role)?.label ??
        (r.label?.trim() || "위원"),
      name: r.name.trim(),
      contact: [r.phone?.trim(), r.email?.trim()].filter(Boolean).join(" · "),
      token: r.token,
    }))
    .filter((r) => r.name);

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
          받습니다. 문서별 서명 링크는 7일이면 만료되므로, 지난 결재 건을 다시
          볼 수 있도록 <b>만료 없는 결재함 링크</b>를 한 번 전달해 두세요.
        </p>
      </div>

      {/*
        등록된 사람을 입력칸 위에 먼저 — 아래는 빈 칸까지 포함한 편집기라
        훑어봐서는 누가 등록돼 있는지, 연락처가 비었는지 알 수 없다.
        연락처 유무를 같이 적는 이유: 서명 링크가 문자·메일로 나가므로 비면 못 보낸다.
      */}
      <SummaryBox>
        <span className="text-xs font-semibold tracking-wider text-gray-400 uppercase">
          등록된 외부 결재자
        </span>
        {registered.length === 0 ? (
          <p className="mt-1 text-muted-foreground">
            아직 없습니다 — 지출 품의는 회장 결재가 필요해 등록 전에는 상신할 수
            없습니다.
          </p>
        ) : (
          <ul className="mt-1.5 space-y-2">
            {registered.map((r) => (
              <li key={r.i}>
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-muted-foreground">{r.roleLabel}</span>
                  <b>{r.name}</b>
                  <span className="text-xs text-muted-foreground">
                    {r.contact ||
                      "연락처 미등록 — 서명 링크를 직접 전달해야 합니다"}
                  </span>
                </div>
                {/* 저장해야 발급된다 — 새 사람을 적어 넣은 직후에는 아직 토큰이 없다 */}
                {r.token ? (
                  <InboxLink
                    token={r.token}
                    isDirector={isDirector}
                    onReissue={() => patch(r.i, { token: "" })}
                  />
                ) : (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    저장하면 결재함 링크가 발급됩니다.
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </SummaryBox>
      {rows.map((row, i) => {
        const fixed = FIXED_ROLES.find((f) => f.role === row.role);
        return (
          /* 바탕은 카드 그대로 — bg-background(회색)를 깔면 흰 카드 안에서 이 상자만 뜬다 */
          <div key={i} className="space-y-2 rounded-lg border p-3">
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
  isDirector,
}: {
  staff: StaffOption[];
  initialLine: string[];
  initialExternal: ExternalApproverInput[];
  isDirector: boolean;
}) {
  const [line, setLine] = useState<string[]>([
    initialLine[0] ?? "",
    initialLine[1] ?? "",
    initialLine[2] ?? "",
  ]);
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

        {/*
        전결 규정은 여기 있었다가 별도 메뉴(/settings/director-limit)로 나갔다 —
        결재선 카드 아래에 붙어 있으니 "거기 있는 줄 몰랐다"가 됐다. 저장 액션도
        갈라져 있다: 한 액션이 둘 다 쓰면 이 화면에서 저장할 때 전결 한도가 지워진다.
      */}
      <CardFooter className="justify-between gap-3 border-t border-gray-100 px-4 py-3">
        <Link
          href="/settings/director-limit"
          className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          관리소장 전결 규정
        </Link>
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
