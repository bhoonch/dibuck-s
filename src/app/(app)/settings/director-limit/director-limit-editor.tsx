"use client";

import { useState } from "react";
import Link from "next/link";
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
import { SummaryBox } from "@/components/ui/summary-box";
import { saveDirectorLimit } from "../actions";

/**
 * 관리소장 전결 규정 — 결재선과 같은 판단이지만 메뉴를 따로 뒀다.
 * 결재선 카드 아래에 붙여 놨더니 "거기 있는 줄 몰랐다"가 됐다.
 *
 * 한도는 **관리규약이 정하는 값이라 코드가 추측하지 않는다.** 규약 원문을 해석하는
 * 대신 금액과 조항 문자열을 그대로 받아, 전결 문서의 관련근거에 인용한다.
 */
export function DirectorLimitEditor({
  initialLimit,
  initialClause,
  isDirector,
}: {
  initialLimit: number | null;
  initialClause: string | null;
  isDirector: boolean;
}) {
  const [limit, setLimit] = useState(
    initialLimit ? initialLimit.toLocaleString("ko-KR") : "",
  );

  return (
    <form action={saveDirectorLimit}>
      <Card className="gap-0 py-0">
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
        <div className="border-b border-gray-100 px-4 py-3">
          <SummaryBox>
            {initialLimit ? (
              <>
                <span className="text-xs font-semibold tracking-wider text-gray-400 uppercase">
                  지금 적용 중
                </span>
                <p className="mt-1">
                  <b className="font-mono text-xl tracking-tight">
                    {initialLimit.toLocaleString("ko-KR")}원
                  </b>
                  <span className="text-muted-foreground"> (VAT 제외)</span>{" "}
                  이하이고 예산에 반영된 지출은 <b>관리소장 전결</b>로 끝납니다.
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {initialClause
                    ? `근거 조항: ${initialClause}`
                    : "근거 조항 미등록 — 문서에는 법령만 인용됩니다"}
                </p>
              </>
            ) : (
              <span className="text-muted-foreground">
                전결 한도가 등록되지 않아 <b>모든 지출 문서에 회장 결재</b>가
                붙습니다. 관리규약의 한도를 아래에 등록해 주세요.
              </span>
            )}
          </SummaryBox>
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
              defaultValue={initialClause ?? ""}
              disabled={!isDirector}
            />
            <p className="text-xs text-muted-foreground">
              전결 문서의 관련근거에 그대로 인용합니다. 비워 두면 법령만
              적습니다.
            </p>
          </div>
        </CardContent>

        <CardFooter className="justify-between gap-3 border-t border-gray-100 px-4 py-3">
          {/* 화면을 나눈 대가 — 둘을 오가는 길을 양쪽에 낸다 */}
          <Link
            href="/settings/approval-line"
            className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            결재선 설정
          </Link>
          {isDirector ? (
            <Button type="submit" size="lg">
              저장
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">
              전결 규정은 마스터만 수정할 수 있습니다.
            </p>
          )}
        </CardFooter>
      </Card>
    </form>
  );
}
