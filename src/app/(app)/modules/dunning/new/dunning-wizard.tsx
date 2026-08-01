"use client";

import { useActionState, useState, useTransition } from "react";
import { Download, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FileUpload } from "@/components/ui/file-upload";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PaperScale } from "@/components/paper-scale";
import { DunningSheets } from "@/components/dunning-paper";
import { buildLetter, koDate, parseAmount, stageLabels, won, type DunningStage } from "@/lib/dunning";
import { ymdKst } from "@/lib/utils";
import {
  createDunningBatch,
  parseDunningExcel,
  prepareManualRows,
  type PreparedRow,
} from "../actions";

type Row = PreparedRow & { stage: DunningStage };

const STEP_LABELS = ["입력", "확인", "미리보기"] as const;
const STAGES = [1, 2, 3] as const;
const selectClass =
  "h-8 rounded-md border border-input bg-transparent px-2 text-sm";

type ManualRow = {
  dong: string;
  ho: string;
  amount: string;
  name: string;
  period: string;
};

export function DunningWizard({
  office, address, tel, sealImage, logoImage, defaultAccount,
  initialManual = [],
}: {
  office: string;
  address: string | null;
  tel: string | null;
  sealImage: string | null;
  logoImage: string | null;
  defaultAccount: string;
  /** 홈의 "다음 단계 발송"이 미납 중 세대를 채워서 보낸다 — 빈 배열이면 보통 시작 */
  initialManual?: ManualRow[];
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [rows, setRows] = useState<Row[]>([]);
  const [dueDate, setDueDate] = useState("");
  const [account, setAccount] = useState(defaultAccount);
  const [pending, startTransition] = useTransition();

  // ① 엑셀 경로 — 파싱·이름 매칭·단계 제안까지 서버가 끝내서 돌려준다
  const [excel, excelAction, excelPending] = useActionState(parseDunningExcel, undefined);
  // 렌더 중 상태 조정 — 결과가 바뀐 순간에만 반영한다(effect로 setState를 하면
  // 한 번 더 렌더가 밀려서 리스크가 있다. React 공식 권장 패턴).
  const [handledExcel, setHandledExcel] = useState(excel);
  if (excel !== handledExcel) {
    setHandledExcel(excel);
    if (excel?.rows) {
      setRows(excel.rows.map((r) => ({ ...r, stage: r.suggestedStage })));
      setStep(2);
    }
  }

  // ① 직접 입력 경로 — 표에 쌓은 행을 같은 준비 함수에 통과시킨다
  const [manual, setManual] = useState<ManualRow[]>(
    initialManual.length > 0
      ? initialManual
      : [{ dong: "", ho: "", amount: "", name: "", period: "" }],
  );
  const submitManual = () => {
    const cleaned = manual
      .filter((m) => m.dong.trim() && m.ho.trim() && parseAmount(m.amount))
      .map((m) => ({
        dong: m.dong.trim().replace(/동$/, ""),
        ho: m.ho.trim().replace(/호$/, ""),
        amount: parseAmount(m.amount),
        name: m.name.trim() || null,
        period: m.period.trim() || null,
      }));
    if (cleaned.length === 0) return toast.error("동·호·미납액을 입력해 주세요.");
    startTransition(async () => {
      const prepared = await prepareManualRows(cleaned);
      setRows(prepared.map((r) => ({ ...r, stage: r.suggestedStage })));
      setStep(2);
    });
  };

  const updateManual = (
    i: number,
    patch: Partial<(typeof manual)[number]>,
  ) => setManual(manual.map((m, j) => (j === i ? { ...m, ...patch } : m)));

  const goPreview = () => {
    if (rows.length === 0) return toast.error("발송할 세대가 없습니다.");
    if (!dueDate) return toast.error("납부 기한을 선택해 주세요.");
    if (!account.trim()) return toast.error("납부 계좌를 입력해 주세요.");
    setStep(3);
  };

  // ③ 생성
  const create = () =>
    startTransition(async () => {
      const result = await createDunningBatch({ rows, dueDate, account });
      if (result?.error) toast.error(result.error); // 성공은 redirect라 여기 안 온다
    });

  const letters = rows.map((r) =>
    buildLetter({
      row: r, stage: r.stage, dueDate: dueDate || "2026-01-01",
      account, office, address,
    }),
  );

  const counts = { 1: 0, 2: 0, 3: 0 } as Record<DunningStage, number>;
  for (const r of rows) counts[r.stage]++;
  const summary = [
    `${rows.length}세대`,
    ...STAGES.filter((s) => counts[s] > 0).map((s) => `${stageLabels[s]} ${counts[s]}`),
  ].join(" · ");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm">
        {STEP_LABELS.map((label, i) => (
          <span key={label} className="flex items-center gap-2">
            {i > 0 && <span className="text-muted-foreground">→</span>}
            <span
              className={
                i + 1 === step
                  ? "font-semibold text-foreground"
                  : "text-muted-foreground"
              }
            >
              {i + 1}. {label}
            </span>
          </span>
        ))}
      </div>

      {step === 1 && (
        <div className="space-y-6">
          {/* 미납 세대를 채워서 들어온 경우 — 표가 먼저 보이도록 엑셀 절보다 위에 안내 */}
          {initialManual.length > 0 && (
            <p className="text-sm text-muted-foreground">
              현재 미납 중인 세대 {initialManual.length}곳을 지난 발송 내용으로
              채웠습니다. 아래 표에서 금액·기간을 이번 회차 기준으로 고친 뒤
              [다음]을 누르세요 — 단계는 다음 걸음에서 자동 제안됩니다.
            </p>
          )}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold">엑셀로 올리기</h2>
            <form action={excelAction} className="space-y-3">
              <FileUpload name="file" accept=".xlsx,.xls,.csv" />
              <p className="text-xs text-muted-foreground">
                엑셀 형식: A열 = 동, B열 = 호, C열 = 미납액(필수), D열 = 이름(선택),
                E열 = 미납 기간(선택).
              </p>
              {excel?.error && (
                <p className="text-sm text-destructive">{excel.error}</p>
              )}
              <div className="flex items-center gap-2">
                <Button type="submit" size="lg" disabled={excelPending}>
                  {excelPending ? "확인 중..." : "엑셀 업로드"}
                </Button>
                <Button asChild variant="outline" size="lg">
                  <a href="/dunning-upload-sample.xlsx" download="미납세대_샘플.xlsx">
                    <Download className="size-4" /> 샘플 파일 받기
                  </a>
                </Button>
              </div>
            </form>
          </section>

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            또는 직접 입력
            <div className="h-px flex-1 bg-border" />
          </div>

          <section className="space-y-3">
            <div className="overflow-x-auto rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>동</TableHead>
                    <TableHead>호</TableHead>
                    <TableHead>미납액</TableHead>
                    <TableHead>이름(선택)</TableHead>
                    <TableHead>미납 기간(선택)</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {manual.map((m, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Input
                          value={m.dong}
                          onChange={(e) => updateManual(i, { dong: e.target.value })}
                          placeholder="101"
                          className="w-20"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={m.ho}
                          onChange={(e) => updateManual(i, { ho: e.target.value })}
                          placeholder="502"
                          className="w-20"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={m.amount}
                          onChange={(e) => updateManual(i, { amount: e.target.value })}
                          placeholder="250000"
                          className="w-28"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={m.name}
                          onChange={(e) => updateManual(i, { name: e.target.value })}
                          placeholder="홍길동"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={m.period}
                          onChange={(e) => updateManual(i, { period: e.target.value })}
                          placeholder="2026년 3월분 ~ 6월분"
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="행 삭제"
                          disabled={manual.length === 1}
                          onClick={() => setManual(manual.filter((_, j) => j !== i))}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex items-center justify-between">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setManual([...manual, { dong: "", ho: "", amount: "", name: "", period: "" }])
                }
              >
                <Plus className="size-4" /> 세대 추가
              </Button>
              <Button type="button" size="lg" onClick={submitManual} disabled={pending}>
                {pending ? "확인 중..." : "다음"}
              </Button>
            </div>
          </section>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-5">
          {/* 단계 규칙은 이 화면에서 처음 마주친다 — 제안 근거를 여기서 설명한다 */}
          <p className="text-xs text-muted-foreground">
            단계는 발송 이력으로 자동 제안됩니다 — 처음 보내는 세대는 1차 납부
            안내, 발송 후에도 납부가 없으면 2차 납부 최고, 마지막이 3차
            내용증명입니다. 세대별로 직접 바꿀 수 있습니다.
          </p>
          <div className="overflow-x-auto rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>세대</TableHead>
                  <TableHead>이름</TableHead>
                  <TableHead>미납액</TableHead>
                  <TableHead>미납 기간</TableHead>
                  <TableHead>단계</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">
                      {r.dong}동 {r.ho}호
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.name ?? "-"}
                    </TableCell>
                    <TableCell>{won(r.amount)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {r.period ?? "-"}
                    </TableCell>
                    <TableCell>
                      <select
                        value={r.stage}
                        onChange={(e) =>
                          setRows(
                            rows.map((row, j) =>
                              j === i
                                ? { ...row, stage: Number(e.target.value) as DunningStage }
                                : row,
                            ),
                          )
                        }
                        className={selectClass}
                      >
                        {STAGES.map((s) => (
                          <option key={s} value={s}>
                            {s}단계 · {stageLabels[s]}
                          </option>
                        ))}
                      </select>
                      {r.stage !== r.suggestedStage && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          지난 발송 이력 기준 제안: {r.suggestedStage}차
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="행 삭제"
                        onClick={() => setRows(rows.filter((_, j) => j !== i))}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="dueDate">납부 기한</Label>
              <Input
                id="dueDate"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="account">납부 계좌</Label>
              <Input
                id="account"
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                placeholder="OO은행 000-0000-0000 (관리사무소)"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Button type="button" variant="outline" size="lg" onClick={() => setStep(1)}>
              이전
            </Button>
            <Button type="button" size="lg" onClick={goPreview}>
              미리보기
            </Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-5">
          <p className="text-sm text-muted-foreground">{summary}</p>
          <PaperScale>
            <DunningSheets
              letters={letters.slice(0, 5)}
              docNo="(생성 시 채번)"
              sentDate={koDate(ymdKst(new Date()))}
              office={office}
              tel={tel}
              sealImage={sealImage}
              logoImage={logoImage}
            />
          </PaperScale>
          {rows.length > 5 && (
            <p className="text-center text-sm text-muted-foreground">
              외 {rows.length - 5}세대 (전체는 생성 후 상세에서 확인할 수 있습니다)
            </p>
          )}
          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => setStep(2)}
              disabled={pending}
            >
              이전
            </Button>
            <Button
              type="button"
              size="lg"
              onClick={create}
              disabled={pending || !dueDate || !account.trim()}
            >
              {pending ? "생성 중..." : `${rows.length}세대 독촉장 만들기`}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
