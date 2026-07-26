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
import { Label } from "@/components/ui/label";
import { saveApprovalLine } from "../actions";

export type StaffOption = {
  id: string;
  name: string;
  label: string; // 직책 또는 권한
};

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

export function ApprovalLineEditor({
  staff,
  initialLine,
  isDirector,
}: {
  staff: StaffOption[];
  initialLine: string[];
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
      <Card className="max-w-3xl gap-0 py-0">
        <CardHeader className="gap-0.5 border-b border-gray-100 px-4 py-3">
          <CardTitle className="text-lg tracking-tight">결재선</CardTitle>
          <CardDescription>
            전자결재 문서가 올라오면 아래 순서대로 승인을 받습니다.
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
        </CardContent>
        <CardFooter className="justify-end border-t border-gray-100 px-4 py-3">
          {isDirector ? (
            <Button type="submit" size="lg">
              저장
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">
              결재선은 소장만 수정할 수 있습니다.
            </p>
          )}
        </CardFooter>
      </Card>
    </form>
  );
}
