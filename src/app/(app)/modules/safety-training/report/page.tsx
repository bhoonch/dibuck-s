import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireTenantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSubscribed } from "@/lib/modules";
import { ymdKst } from "@/lib/utils";
import {
  LEGAL_BASIS,
  LEGAL_HOURS,
  courseTypeOf,
  formatHours,
  halfRange,
  isSamePerson,
  newHireProgress,
  parseExtTrainings,
  parseHours,
  personProgress,
  supervisorProgress,
  type AttendeeSnap,
  type CourseType,
  type Half,
  type PersonProgress,
} from "@/lib/safety-training";
import { Button } from "@/components/ui/button";
import { PrintStyle } from "@/components/gian-paper";
import { PrintButton } from "../[docId]/print-button";

/**
 * 연간 안전교육 보고서 — 감사·점검 때 "근로자별·연도별로 했는가"를 한 번에 내미는 화면.
 * 열 때마다 완성 일지에서 계산한다(홈 이행 현황과 같은 철학 — 저장값 없음).
 * 실제 증빙은 서명된 원본 일지다: 각 행의 문서번호가 그리로의 연결고리다.
 */

type LogMeta = {
  courseType?: CourseType;
  date?: string;
  hours?: unknown;
  attendees?: AttendeeSnap[];
};

export default async function TrainingReportPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const session = await requireTenantSession();
  const tenantId = session.tenantId!;
  if (!(await isSubscribed(tenantId, "safety-training")))
    redirect("/subscriptions");

  const [docs, roster, tenant] = await Promise.all([
    db.document.findMany({
      where: { tenantId, type: "safety_training", status: "final" },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        docNo: true,
        title: true,
        meta: true,
        createdAt: true,
      },
    }),
    // 비활성(퇴사자)도 읽는다 — 지난 연도 보고서엔 그해 근무했던 퇴사자가 나와야 한다
    db.trainingStaff.findMany({
      where: { tenantId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        position: true,
        office: true,
        hiredAt: true,
        active: true,
        supervisor: true,
        extTrainings: true,
      },
    }),
    db.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { name: true },
    }),
  ]);

  const sessions = docs.map((d) => {
    const m = (d.meta ?? {}) as LogMeta;
    return {
      id: d.id,
      docNo: d.docNo ?? "",
      title: d.title,
      courseType: m.courseType ?? ("regular" as CourseType),
      date: m.date ?? ymdKst(d.createdAt),
      hours: m.hours,
      attendees: m.attendees ?? [],
    };
  });

  const now = new Date();
  const todayYmd = ymdKst(now);
  const sp = await searchParams;
  const year = /^\d{4}$/.test(sp.year ?? "") ? sp.year! : todayYmd.slice(0, 4);
  const years = [
    ...new Set([
      todayYmd.slice(0, 4),
      ...sessions.map((s) => s.date.slice(0, 4)),
    ]),
  ]
    .sort()
    .reverse();

  const yearSessions = sessions.filter((s) => s.date.startsWith(`${year}-`));
  const h1: Half = { year: +year, half: 1 };
  const h2: Half = { year: +year, half: 2 };
  // 아직 시작 안 한 반기는 판정하지 않는다 — 0시간을 미이수로 찍으면 거짓 기록이다
  const started = (h: Half) => halfRange(h).start <= todayYmd;
  const p1 = new Map(
    personProgress(now, yearSessions, roster, h1).map((p) => [p.id, p]),
  );
  const p2 = new Map(
    personProgress(now, yearSessions, roster, h2).map((p) => [p.id, p]),
  );
  // 채용 시 교육은 개인별 1회성 — 보고서에는 그해 입사자만 싣는다
  const newHire = new Map(
    newHireProgress(now, sessions, roster)
      .filter((p) => p.hiredAt && ymdKst(p.hiredAt).startsWith(`${year}-`))
      .map((p) => [p.id, p]),
  );
  // 관리감독자(소장)는 반기 6/12h가 아니라 연 16시간 — 앱 일지 + 외부 이수 합산
  const sv = new Map(
    supervisorProgress(+year, yearSessions, roster).map((p) => [p.id, p]),
  );
  const extOf = (s: (typeof roster)[number]) =>
    parseExtTrainings(s.extTrainings).filter((t) =>
      t.date.startsWith(`${year}-`),
    );
  const attendedOf = (s: (typeof roster)[number]) =>
    yearSessions.filter((l) => l.attendees.some((a) => isSamePerson(a, s)));

  // 비활성 직원은 그해 참석 기록이 있을 때만 — 0시간 퇴사자로 표가 넘치는 것 방지
  const rows = roster
    .map((s) => ({ staff: s, attended: attendedOf(s), ext: extOf(s) }))
    .filter((r) => r.staff.active || r.attended.length > 0 || r.ext.length > 0);

  // 직군 판정은 현재 활성 명부 기준 — 지난 연도의 당시 명부는 알 수 없다(하단 각주 명기)
  // 관리감독자는 반기 집계 대상이 아니라 직군 판정에서도 뺀다
  const judge = (
    byId: Map<string, PersonProgress>,
    office: boolean,
    h: Half,
  ) => {
    if (!started(h)) return "—";
    const g = rows.filter(
      (r) => r.staff.active && !r.staff.supervisor && r.staff.office === office,
    );
    if (g.length === 0) return "해당 없음";
    return g.every((r) => byId.get(r.staff.id)?.done)
      ? "전원 이수"
      : "미이수 있음";
  };
  const supervisorLogs = yearSessions.filter(
    (l) => l.courseType === "supervisor",
  );
  const supervisorHours = supervisorLogs.reduce(
    (sum, l) => sum + (parseHours(l.hours) ?? 0),
    0,
  );
  const svList = [...sv.values()];
  const nhList = [...newHire.values()];

  const personCell = (
    p: PersonProgress | undefined,
    active: boolean,
    h: Half,
  ) => {
    if (!p || !started(h)) return { text: "—", badge: "" };
    return {
      text: `${formatHours(p.hours) || "0시간"} / ${p.required}시간`,
      badge: p.done ? "이수" : active ? "미이수" : "퇴사",
    };
  };

  const th =
    "border border-gray-400 bg-gray-50 px-2 py-1.5 text-xs font-semibold";
  const td = "border border-gray-400 px-2 py-1.5 text-xs";

  return (
    <>
      <PrintStyle target="training-report" />
      <div className="mx-auto max-w-[900px]">
        <div className="print:hidden">
          <Link
            href="/modules/safety-training"
            className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
            안전교육일지
          </Link>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <h1 className="text-lg font-bold">연간 안전교육 보고서</h1>
            <nav className="flex gap-1">
              {years.map((y) => (
                <Button
                  key={y}
                  asChild
                  size="sm"
                  variant={y === year ? "default" : "outline"}
                >
                  <Link href={`/modules/safety-training/report?year=${y}`}>
                    {y}년
                  </Link>
                </Button>
              ))}
            </nav>
            <span className="ml-auto">
              <PrintButton />
            </span>
          </div>
          <p className="mb-4 text-sm text-muted-foreground">
            감사·점검 때 그대로 인쇄해 제출하는 확인 문서입니다. 완성된
            교육일지에서 열 때마다 집계하며, 각 행의 문서번호가 서명된 원본
            일지의 증빙 연결입니다.
          </p>
        </div>

        <div id="training-report" className="space-y-8 bg-white p-6 print:p-0">
          <header className="space-y-1 text-center">
            <h2 className="text-xl font-bold">{year}년 안전교육 실시 현황</h2>
            <p className="text-sm">{tenant.name} 관리사무소</p>
            <p className="text-xs text-gray-500">
              근거: {LEGAL_BASIS} · 출력일: {todayYmd}
            </p>
          </header>

          {/* 1. 연간 요약 */}
          <section>
            <h3 className="mb-2 text-sm font-bold">1. 연간 요약</h3>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={th}>구분</th>
                  <th className={th}>법정 기준</th>
                  <th className={th}>상반기</th>
                  <th className={th}>하반기</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className={td}>정기교육 · 사무직</td>
                  <td className={td}>{LEGAL_HOURS.regularOffice}</td>
                  <td className={`${td} text-center`}>{judge(p1, true, h1)}</td>
                  <td className={`${td} text-center`}>{judge(p2, true, h2)}</td>
                </tr>
                <tr>
                  <td className={td}>정기교육 · 그 외 근로자</td>
                  <td className={td}>{LEGAL_HOURS.regularField}</td>
                  <td className={`${td} text-center`}>
                    {judge(p1, false, h1)}
                  </td>
                  <td className={`${td} text-center`}>
                    {judge(p2, false, h2)}
                  </td>
                </tr>
                <tr>
                  <td className={td}>관리감독자 교육</td>
                  <td className={td}>{LEGAL_HOURS.supervisor}</td>
                  <td className={`${td} text-center`} colSpan={2}>
                    {/* 명부에 관리감독자가 표시돼 있으면 인별 16시간 판정(외부 이수 포함),
                        아니면 예전 기준(실시 여부)으로 떨어진다 — complianceOf와 같은 규칙 */}
                    {svList.length > 0
                      ? `대상 ${svList.length}명 중 ${svList.filter((p) => p.done).length}명 이수 (외부 이수 포함)`
                      : supervisorLogs.length > 0
                        ? `실시 (${supervisorLogs.length}회 · ${formatHours(supervisorHours)})`
                        : "미실시"}
                  </td>
                </tr>
                <tr>
                  <td className={td}>채용 시 교육 ({year}년 입사자)</td>
                  <td className={td}>{LEGAL_HOURS.newHire}</td>
                  <td className={`${td} text-center`} colSpan={2}>
                    {nhList.length === 0
                      ? "해당 없음"
                      : `대상 ${nhList.length}명 중 ${nhList.filter((p) => p.done).length}명 이수`}
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="mt-1 text-[11px] text-gray-500">
              ※ 직군 판정은 현재 재직 중인 직원 명부 기준입니다. 퇴사자는 아래
              집계표에 이수 시간으로만 표시하며, 퇴사일을 알 수 없어 미이수로
              판정하지 않습니다.
            </p>
          </section>

          {/* 2. 근로자별 연간 집계표 */}
          <section>
            <h3 className="mb-2 text-sm font-bold">2. 근로자별 이수 집계</h3>
            {rows.length === 0 ? (
              <p className="text-sm text-gray-500">
                직원 명부가 비어 있습니다.
              </p>
            ) : (
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className={th}>성명</th>
                    <th className={th}>직종</th>
                    <th className={th} colSpan={2}>
                      정기교육 · 상반기
                    </th>
                    <th className={th} colSpan={2}>
                      정기교육 · 하반기
                    </th>
                    <th className={th}>채용 시</th>
                    <th className={th}>참석 회차</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ staff: s, attended, ext }) => {
                    const nh = newHire.get(s.id);
                    const svp = sv.get(s.id);
                    // 관리감독자는 반기 칸 대신 연간 16시간 한 칸 — 반기 칸에 두면
                    // "정기교육 미이수"로 찍힌다(거짓 기록)
                    if (svp) {
                      return (
                        <tr key={s.id}>
                          <td className={`${td} font-medium`}>
                            {s.name}
                            {!s.active && (
                              <span className="ml-1 text-gray-500">(퇴사)</span>
                            )}
                          </td>
                          <td className={`${td} text-center`}>관리감독자</td>
                          <td className={`${td} text-center`} colSpan={4}>
                            연간 {formatHours(svp.hours) || "0시간"} / 16시간
                            {svp.extHours > 0 &&
                              ` (외부 ${formatHours(svp.extHours)} 포함)`}
                            {" — "}
                            {svp.done ? "이수" : s.active ? "미이수" : "퇴사"}
                          </td>
                          <td className={`${td} text-center`}>
                            {nh
                              ? nh.done
                                ? "이수"
                                : `${nh.hours}/${nh.required}h`
                              : "—"}
                          </td>
                          <td className={`${td} text-center tabular-nums`}>
                            {attended.length + ext.length}회
                          </td>
                        </tr>
                      );
                    }
                    const c1 = personCell(p1.get(s.id), s.active, h1);
                    const c2 = personCell(p2.get(s.id), s.active, h2);
                    return (
                      <tr key={s.id}>
                        <td className={`${td} font-medium`}>
                          {s.name}
                          {!s.active && (
                            <span className="ml-1 text-gray-500">(퇴사)</span>
                          )}
                        </td>
                        <td className={`${td} text-center`}>{s.position}</td>
                        <td className={`${td} text-right tabular-nums`}>
                          {c1.text}
                        </td>
                        <td className={`${td} text-center`}>{c1.badge}</td>
                        <td className={`${td} text-right tabular-nums`}>
                          {c2.text}
                        </td>
                        <td className={`${td} text-center`}>{c2.badge}</td>
                        <td className={`${td} text-center`}>
                          {nh
                            ? nh.done
                              ? "이수"
                              : `${nh.hours}/${nh.required}h`
                            : "—"}
                        </td>
                        <td className={`${td} text-center tabular-nums`}>
                          {attended.length}회
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>

          {/* 3. 개인별 이수 카드 — 인쇄 시 한 사람 한 장 */}
          <section>
            <h3 className="mb-2 text-sm font-bold print:break-before-page">
              3. 개인별 교육 이수 기록
            </h3>
            <div className="space-y-6">
              {/* 첫 사람은 구역 제목과 같은 페이지 — 전원에 걸면 제목만 남은 빈 쪽이 생긴다 */}
              {rows.map(({ staff: s, attended, ext }, i) => (
                <div
                  key={s.id}
                  className={i === 0 ? undefined : "print:break-before-page"}
                >
                  <div className="mb-1.5 flex items-baseline gap-2 border-b border-gray-400 pb-1">
                    <span className="text-sm font-bold">{s.name}</span>
                    <span className="text-xs text-gray-600">
                      {s.supervisor ? "관리감독자" : s.position}
                    </span>
                    {s.hiredAt && (
                      <span className="text-xs text-gray-600">
                        입사 {ymdKst(s.hiredAt)}
                      </span>
                    )}
                    {!s.active && (
                      <span className="text-xs text-gray-600">퇴사</span>
                    )}
                    <span className="ml-auto text-xs text-gray-600">
                      {year}년 참석 {attended.length + ext.length}회
                    </span>
                  </div>
                  {attended.length + ext.length === 0 ? (
                    <p className="text-xs text-gray-500">
                      {year}년 참석 기록이 없습니다.
                    </p>
                  ) : (
                    <table className="w-full border-collapse">
                      <thead>
                        <tr>
                          <th className={`${th} w-24`}>교육일자</th>
                          <th className={`${th} w-28`}>교육 종류</th>
                          <th className={th}>교육명</th>
                          <th className={`${th} w-20`}>교육시간</th>
                          <th className={`${th} w-36`}>문서번호</th>
                        </tr>
                      </thead>
                      <tbody>
                        {attended.map((l) => (
                          <tr key={l.id}>
                            <td className={`${td} text-center tabular-nums`}>
                              {l.date}
                            </td>
                            <td className={`${td} text-center`}>
                              {courseTypeOf(l.courseType)?.label ?? "-"}
                            </td>
                            <td className={td}>
                              <Link
                                href={`/modules/safety-training/${l.id}`}
                                className="hover:underline"
                              >
                                {l.title}
                              </Link>
                            </td>
                            <td className={`${td} text-center`}>
                              {formatHours(l.hours)}
                            </td>
                            <td className={`${td} text-center`}>
                              {l.docNo || "-"}
                            </td>
                          </tr>
                        ))}
                        {/* 외부 이수 — 원본 증빙이 앱 밖(수료증)이라 문서번호 대신 보관처를 적는다 */}
                        {ext.map((t, i) => (
                          <tr key={`ext-${i}`}>
                            <td className={`${td} text-center tabular-nums`}>
                              {t.date}
                            </td>
                            <td className={`${td} text-center`}>
                              관리감독자(외부)
                            </td>
                            <td className={td}>{t.org}</td>
                            <td className={`${td} text-center`}>
                              {formatHours(t.hours)}
                            </td>
                            <td className={`${td} text-center`}>
                              수료증 별도 보관
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
