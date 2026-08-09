import {
  LEGAL_BASIS,
  formatHours,
  type AttendeeSnap,
  type TrainingDraft,
} from "@/lib/safety-training";
import { PhotoSheet } from "@/components/photo-sheet";

/** 공문서 날짜 표기 "2026. 08. 03." — 폼의 YYYY-MM-DD를 그대로 바꾼다 */
const paperDate = (ymd: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? `${ymd.replace(/-/g, ". ")}.` : ymd;

/**
 * 안전보건교육 일지 A4 렌더러 — 책상 증빙 문서라 활자는 기안서 축(본문 11.5pt).
 * KOSHA·고용부 서식 구성: 정보 표 → 교육 내용(개조식) → 참석자 서명 표 → 하단 확인란.
 * 참석자 표는 2단(한 줄에 두 명) — 12명 이하 A4 1장이 목표다. 서명은 인쇄 후 자필.
 */
export function SafetyTrainingPaper({
  docNo,
  courseLabel,
  date,
  place,
  hours,
  instructor,
  draft,
  attendees,
  targetCount,
  absentReason,
  office,
  photos = [],
  id = "a4-sheet",
}: {
  docNo: string;
  courseLabel: string;
  /** 교육일자 YYYY-MM-DD */
  date: string;
  place: string;
  /** 교육시간 — 새 일지는 숫자, 옛 일지는 자유 텍스트("1시간"). 표기는 formatHours가 맡는다 */
  hours: unknown;
  instructor: string;
  draft: TrainingDraft;
  attendees: AttendeeSnap[];
  /** 교육 대상자 수 스냅샷 — 없으면(구버전 일지) 참석자 수로 간주해 미참석 줄을 만들지 않는다 */
  targetCount?: number;
  /** 미참석 사유 (선택) — 미참석자가 있을 때만 의미가 있다 */
  absentReason?: string;
  /** 하단 확인란 명의 (예: "행복아파트 관리사무소장") */
  office: string;
  /** 교육 사진 사진대지 — docPhotoRows()가 만든 렌더 행. 없으면 종전과 동일 */
  photos?: { id: string; caption: string }[];
  id?: string;
}) {
  const line = "border border-[var(--gian-doc-line)]";
  const th = `${line} bg-[var(--gian-paper)] px-[2mm] py-[1.2mm] text-center text-[10pt] font-bold whitespace-nowrap`;
  const td = `${line} px-[2.5mm] py-[1.2mm] text-[10.5pt]`;

  // 교육인원 — 대상은 스냅샷, 참석은 명단 수. 감독 점검이 보는 건 "대상 전원이 받았나"다
  const target = targetCount ?? attendees.length;
  const absent = Math.max(0, target - attendees.length);

  // 참석자 2단 — [왼쪽 i, 오른쪽 i+rows] 짝. 홀수면 오른쪽 마지막 칸은 빈칸
  const rows = Math.ceil(attendees.length / 2);
  const pair = (i: number): [number, AttendeeSnap | undefined][] => [
    [i, attendees[i]],
    [i + rows, attendees[i + rows]],
  ];

  return (
    <article
      id={id}
      // 행간 1.5 — 참석자 12명·주제 2개 회차가 A4 한 장에 앉는 한계선(헤드리스 실측값)
      className="flex w-full max-w-[210mm] shrink-0 flex-col bg-[var(--gian-card)] px-[16mm] pt-[18mm] pb-[12mm] text-[11.5pt] leading-[1.5] text-[var(--gian-ink)] shadow-[var(--gian-shadow)] lg:min-h-[297mm] lg:w-[210mm] [border:1.5px_solid_var(--gian-doc-line)] print:min-h-0 print:border-0 print:p-0 print:shadow-none print:[zoom:var(--print-fit,1)]"
    >
      <h2 className="mb-1.5 text-center text-[17pt] font-extrabold tracking-[.3em] indent-[.3em] text-balance">
        안전보건교육 일지
      </h2>
      <div className="mx-auto mb-[5mm] h-[2.5px] w-[120px] bg-[var(--gian-ink)]" />

      {/* 정보 표 — 문서번호·구분·일시·시간·장소·강사 (전부 폼 값 그대로) */}
      <table className="w-full border-collapse">
        <tbody>
          <tr>
            <th className={`${th} w-[24mm]`}>문서번호</th>
            <td className={td}>{docNo}</td>
            <th className={`${th} w-[24mm]`}>교육구분</th>
            <td className={td}>{courseLabel}</td>
          </tr>
          <tr>
            <th className={th}>교육일자</th>
            <td className={td}>{paperDate(date)}</td>
            <th className={th}>교육시간</th>
            <td className={td}>{formatHours(hours)}</td>
          </tr>
          <tr>
            <th className={th}>교육장소</th>
            <td className={td}>{place}</td>
            <th className={th}>강　　사</th>
            <td className={td}>{instructor}</td>
          </tr>
          <tr>
            <th className={th}>교육인원</th>
            <td className={td} colSpan={3}>
              대상 {target}명 · 참석 {attendees.length}명
              {absent > 0 && (
                <>
                  {" "}
                  · 미참석 {absent}명
                  {absentReason && (
                    <span className="text-[var(--gian-ink-soft)]">
                      {" "}
                      ({absentReason})
                    </span>
                  )}
                </>
              )}
            </td>
          </tr>
        </tbody>
      </table>
      <p className="mt-[1.5mm] text-[9pt] text-[var(--gian-ink-soft)]">
        근거: {LEGAL_BASIS}
      </p>

      {/* 교육 내용 — 주제별 개조식. 기호(가. 나.)는 문안에 들어 있다 */}
      <section className="mt-[5mm]">
        <h3 className="mb-[1.5mm] text-[12pt] font-extrabold">교육 내용</h3>
        {draft.sections.map((sec, i) => (
          <div key={i} className="mb-[2.5mm]">
            <p className="mb-0.5 font-bold">
              {i + 1}. {sec.heading}
            </p>
            <div className="pl-4">
              {/* 행잉 인던트 — 줄이 넘어가면 "가. " 기호 폭(1.6em)만큼 들여 본문끼리 정렬 */}
              {sec.lines.map((l, j) => (
                <p
                  key={j}
                  className="-indent-[1.6em] pl-[1.6em] whitespace-pre-wrap"
                >
                  {l}
                </p>
              ))}
            </div>
          </div>
        ))}
        {draft.closing && (
          <p className="-indent-[1.6em] pl-[calc(1rem+1.6em)]">
            ※ {draft.closing}
          </p>
        )}
      </section>

      {/* 참석자 서명 표 — 인쇄 후 자필 서명. 쪽이 나뉘어도 행 중간은 자르지 않는다 */}
      <section className="mt-[4mm]">
        <h3 className="mb-[1.5mm] text-[12pt] font-extrabold">
          참석자 명단{" "}
          <span className="font-normal">(총 {attendees.length}명)</span>
        </h3>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {[0, 1].map((k) => (
                <SignHead key={k} th={th} />
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_, i) => (
              <tr key={i} className="break-inside-avoid">
                {pair(i).map(([n, a], k) => (
                  <SignCells key={k} n={n} a={a} line={line} td={td} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* 교육 실시 증빙 사진 — 참석자 표 아래·확인란 위 */}
      <PhotoSheet photos={photos} />

      {/* 확인란은 내용이 짧아도 용지 맨 아래 — 여백이 위가 아니라 가운데로 간다 */}
      <div className="flex-1" />
      <div className="mt-[5mm] break-inside-avoid text-center">
        <p>위와 같이 안전보건교육을 실시하였음.</p>
        <p className="mt-[2mm]">{paperDate(date)}</p>
        {/* 확인은 소장 한 줄 — 강사는 상단 정보 표에 있고, 관리사무소는 사실상 항상
            소장이 강사라 강사 서명 줄을 따로 두면 같은 사람이 두 번 찍게 된다 */}
        <div className="mt-[3mm] ml-auto w-fit text-right">
          <p className="font-bold">
            {office}{" "}
            <span className="font-normal text-[var(--gian-ink-soft)]">
              (인)
            </span>
          </p>
        </div>
      </div>
    </article>
  );
}

function SignHead({ th }: { th: string }) {
  return (
    <>
      <th className={`${th} w-[9mm]`}>번호</th>
      <th className={th}>성명</th>
      <th className={`${th} w-[14mm]`}>직종</th>
      <th className={`${th} w-[22mm]`}>서명</th>
    </>
  );
}

function SignCells({
  n,
  a,
  line,
  td,
}: {
  n: number;
  a: AttendeeSnap | undefined;
  line: string;
  td: string;
}) {
  if (!a)
    return (
      <>
        <td className={line} />
        <td className={line} />
        <td className={line} />
        <td className={line} />
      </>
    );
  return (
    <>
      <td className={`${td} text-center`}>{n + 1}</td>
      <td className={td}>{a.name}</td>
      <td className={`${td} text-center`}>{a.position}</td>
      {/* 서명 칸 — 자필 공간이라 높이만 확보한다 */}
      <td className={`${line} h-[8mm]`} />
    </>
  );
}
