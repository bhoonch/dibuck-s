import {
  maskName,
  toSpeech,
  voteCounts,
  type Attendee,
  type MinutesAgenda,
  type Speech,
} from "@/lib/minutes";
import { ymdhmKst } from "@/lib/utils";

/** 서명 진행 스텝 — 참석자 배열과 order(1부터)로 짝짓는다 */
export type MinutesSignStep = {
  order: number;
  status: string; // "pending" | "approved" | ...
  actedAt: Date | null;
  name: string;
};

/** 성원보고 숫자 — lib/minutes의 quorum() 결과를 그대로 받는다(계산은 서버에서) */
export type QuorumReport = {
  seats: number;
  unfilled: number;
  members: number;
  required: number;
  present: number;
  absent: number;
};

const line = "border border-[var(--gian-doc-line)]";
const th = `${line} bg-[var(--gian-paper)] px-[2mm] py-[1.2mm] text-center text-[10pt] font-bold whitespace-nowrap`;
const td = `${line} px-[2.5mm] py-[1.2mm] text-[10.5pt]`;
const th2 = `${line} bg-[var(--gian-paper)] px-[2mm] py-[1mm] text-center text-[8.5pt] font-bold whitespace-nowrap`;
const td2 = `${line} px-[2.5mm] py-[1mm] text-[8.5pt]`;

/** 직함에서 선거구 동 유도 — "101동 동대표"면 서명표 '동' 칸에 101동. 데이터는 안 바꾼다 */
const dongOf = (a: Attendee) => a.dong ?? /^(\d+동)/.exec(a.label)?.[1] ?? "";

/**
 * 발언자 표기 공개용 마스킹 — 마지막 낱말을 성명으로 보고 maskName(첫 글자만 남김),
 * 동·호 낱말은 뺀다. "101동 동대표 박일동" → "동대표 박○○". 발언 내용 속 개인정보는
 * 자동 판별하지 않는다(법 해석 경계) — 화면에서 사람이 확인하라고 안내한다.
 */
function maskSpeaker(speaker: string): string {
  const words = speaker.trim().split(/\s+/).filter((w) => !/^\d+(동|호)$/.test(w));
  if (words.length === 0) return "";
  words[words.length - 1] = maskName(words[words.length - 1]);
  return words.join(" ");
}

/**
 * 회의록 A4 렌더러 — 서울특별시 공동주택관리규약 준칙 [별첨 3](제43조제1항 관련,
 * 2024. 7. 31. 개정)의 기재항목·표 구성을 따르되 **연속 조판**한다(2026-08-10 사용자
 * 결정). 별첨3은 기재항목과 서식 예시지 "3장 의무"가 아니다 — 강제 면 분리를 없애면
 * 분량대로 1~2장에 담긴다. 표 순서는 준칙 그대로:
 *
 *   표지 정보(회의구분·일시·장소·배석·진행순서) → 성원보고(총정원~불참) →
 *   심의표(안건|가/부|의결사항) → 주요 발언내용(발언자|내용) →
 *   마감 블록(폐회·확인·작성일·주체·서명표) → 전자서명 기록(디벅 고유 증거력 장치)
 *
 * 마감 블록(폐회·확인 문구·작성일·발행 주체·서명표)은 문서 맨 끝 하나다 — 준칙
 * 3면 서식은 면마다 서명표를 뒀지만 그건 낱장 산물이고, 연속 조판에서는 의사록
 * 공통 관행(확인 문구 → 작성일 → 주체 → 서명)대로 끝에 모은다.
 *
 * masked=true는 공개용(준칙 제43조②·⑤ — 300세대 이상 14일 이상 게시) — 문서의
 * **모든 개인 성명**을 가리고 직책·동 표기만 남긴다. 발언자만 가리면 표결 명단·
 * 서명표·작성자 줄의 원본 성명과 대조해 바로 풀린다 — ⑤항은 "발언자를 유추할 수
 * 있는 사항"까지 비식별을 요구하므로 교차 참조 경로를 전부 끊는다. 명문보다 더
 * 가리는 방향의 오차는 위반을 만들지 않는다.
 *
 * 서명표는 steps로 채운다: approved 행은 "전자서명 YYYY-MM-DD HH:mm",
 * 나머지는 빈칸(자필란)이다.
 */
export function MinutesPaper({
  docNo,
  meetingNo,
  meetingAt,
  kind,
  place,
  attendees,
  agendas,
  quorum,
  writerName,
  observers = [],
  issuedDate,
  tenantName,
  steps = [],
  masked = false,
  id = "a4-sheet",
}: {
  docNo: string;
  meetingNo: number;
  /** "2026년 8월 10일(월) 19:00 ~ 20:30" — 표시용으로 이미 포맷된 값 */
  meetingAt: string;
  kind?: string;
  place: string;
  attendees: Attendee[];
  agendas: MinutesAgenda[];
  quorum: QuorumReport;
  writerName?: string;
  observers?: string[];
  /** 서명 확인 문구 위 날짜 — "2026년 8월 10일" */
  issuedDate: string;
  tenantName: string;
  steps?: MinutesSignStep[];
  /** 공개용 — 발언자 성명 마스킹 */
  masked?: boolean;
  id?: string;
}) {
  const present = attendees.filter((a) => a.present);
  const absent = attendees.filter((a) => !a.present);
  /** 공개용이면 성명 마스킹 — 이 함수를 안 거친 성명 표기가 남으면 마스킹 전체가 무력화된다 */
  const nm = (name: string) => (masked ? maskName(name) : name);
  const writer = writerName?.trim();
  const signerTitle = `입주자대표회의 ${writer ? `회장 ${nm(writer)}` : "회장"}`;
  const speakerText = (sp: Speech) =>
    masked ? maskSpeaker(sp.speaker) : sp.speaker;

  /**
   * 서명표 — 준칙 서식은 연번 1~8 / 9~16을 좌우 두 단으로 놓는다.
   * 참석자를 반으로 갈라 같은 표 두 개로 그린다. 연번은 서명 스텝 order와 같은
   * 규칙(참석자 present 순서 + 1)이라 여기서 어긋나면 서명이 엉뚱한 행에 찍힌다.
   */
  const half = Math.ceil(present.length / 2) || 1;
  const signTable = (
    <section className="mt-[3mm] break-inside-avoid">
      <div className="flex gap-[3mm]">
        {[0, 1].map((c) => (
          <table key={c} className="w-full border-collapse">
            <thead>
              <tr>
                <th className={`${th} w-[10mm]`}>연번</th>
                <th className={`${th} w-[14mm]`}>동</th>
                <th className={`${th} w-[22mm]`}>직책</th>
                <th className={`${th} w-[20mm]`}>성명</th>
                <th className={th}>서명</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: half }).map((_, k) => {
                const i = c * half + k;
                const a = present[i];
                const step = a ? steps.find((s) => s.order === i + 1) : undefined;
                const signed = step?.status === "approved" && step.actedAt;
                return (
                  <tr key={k} className="break-inside-avoid">
                    <td className={`${td} h-[9mm] text-center`}>{a ? i + 1 : ""}</td>
                    <td className={td}>{a ? dongOf(a) : ""}</td>
                    <td className={td}>{a?.label ?? ""}</td>
                    <td className={td}>{a ? nm(a.name) : ""}</td>
                    <td
                      className={`${line} px-[2mm] text-center text-[8pt] text-[var(--gian-ink-soft)]`}
                    >
                      {signed ? `전자서명 ${ymdhmKst(step!.actedAt!)}` : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ))}
      </div>
    </section>
  );

  return (
    <article
      id={id}
      /* 블록 흐름(비 flex) — 인쇄 페이지 분할은 블록에서만 내용 경계대로 일어난다.
         flex는 3면 시절 스페이서용이었고 지금은 쓰지 않는다 */
      className="w-full max-w-[210mm] shrink-0 bg-[var(--gian-card)] px-[16mm] pt-[18mm] pb-[12mm] text-[11.5pt] leading-[1.5] text-[var(--gian-ink)] shadow-[var(--gian-shadow)] lg:min-h-[297mm] lg:w-[210mm] [border:1.5px_solid_var(--gian-doc-line)] print:min-h-0 print:border-0 print:p-0 print:shadow-none"
    >
      <h2 className="mb-1.5 text-center text-[17pt] font-extrabold tracking-[.2em] indent-[.2em] text-balance">
        제{meetingNo}차 입주자대표회의 회의록
      </h2>
      <div className="mx-auto mb-[5mm] h-[2.5px] w-[120px] bg-[var(--gian-ink)]" />

      <div className="mb-[3mm] flex flex-wrap justify-between gap-2 text-[10pt]">
        <span className="text-[var(--gian-ink-soft)]">{docNo}</span>
        <span>회의록 작성자 : {signerTitle}</span>
      </div>

      <div className="flex gap-[3mm]">
        <table className="w-full border-collapse">
          <tbody>
            <tr>
              <th className={`${th} w-[24mm]`}>회의구분</th>
              <td className={td}>{kind ? `${kind}회의` : "정기회의"}</td>
            </tr>
            <tr>
              <th className={th}>회의일시</th>
              <td className={td}>{meetingAt}</td>
            </tr>
            <tr>
              <th className={th}>회의장소</th>
              <td className={td}>{place || "미정"}</td>
            </tr>
            <tr>
              <th className={th}>배　　석</th>
              <td className={td}>
                {(masked ? observers.map(maskSpeaker) : observers).join(", ") ||
                  "-"}
              </td>
            </tr>
          </tbody>
        </table>
        <div
          className={`${line} w-[52mm] shrink-0 px-[3mm] py-[2mm] text-[9.5pt]`}
        >
          <p className="mb-[1mm] font-bold">[회의 진행순서]</p>
          <ol className="space-y-[0.5mm]">
            <li>1. 개회선언</li>
            <li>2. 국민의례</li>
            <li>3. 안건 상정 및 토의</li>
            <li>4. 폐회</li>
          </ol>
        </div>
      </div>

      <table className="mt-[4mm] w-full border-collapse break-inside-avoid">
        <thead>
          <tr>
            <th className={th}>총정원</th>
            <th className={th}>미선출</th>
            <th className={th}>구성원</th>
            <th className={th}>의결정족수</th>
            <th className={th}>참석</th>
            <th className={th}>불참</th>
          </tr>
        </thead>
        <tbody>
          <tr className="text-center">
            <td className={td}>{quorum.seats}명</td>
            <td className={td}>{quorum.unfilled}명</td>
            <td className={td}>{quorum.members}명</td>
            <td className={td}>{quorum.required}명</td>
            <td className={td}>{quorum.present}명</td>
            <td className={td}>{quorum.absent}명</td>
          </tr>
        </tbody>
      </table>
      {absent.length > 0 && (
        <p className="mt-[1.5mm] text-[9.5pt] text-[var(--gian-ink-soft)]">
          불참 : {absent.map((a) => `${a.label} ${nm(a.name)}`).join(", ")}
        </p>
      )}

      {/* ── 심의표: 준칙 [별첨3 제2호서식] ─────────────────────── */}
      <table className="mt-[6mm] w-full border-collapse">
        <thead>
          <tr>
            <th className={th}>안건 및 심의(토의) 내용</th>
            <th className={`${th} w-[14mm]`}>가/부</th>
            <th className={`${th} w-[72mm]`}>의결사항</th>
          </tr>
        </thead>
        <tbody>
          {agendas.map((a) => {
            const c = voteCounts(a);
            const voted = c.for + c.against + c.abstain > 0;
            // break-inside-avoid를 걸지 않는다 — 발언이 긴 안건 행을 통째로 다음 장에
            // 밀면 앞 장 하단에 큰 공백이 남는다. 행 안에서 줄 단위로 넘어가고,
            // thead는 인쇄 표준 동작으로 다음 장에 자동 반복된다.
            return (
              <tr key={a.order} className="align-top">
                <td className={td}>
                  <p className="font-bold">
                    {a.order}. {a.title}
                  </p>
                  {a.discussion.map((l, j) => {
                    const sp = toSpeech(l);
                    const who = speakerText(sp);
                    return (
                      <p
                        key={j}
                        className="mt-[1mm] -indent-[1.2em] pl-[1.2em] text-[10pt]"
                      >
                        ㆍ {who ? `${who}: ` : ""}
                        {sp.text}
                      </p>
                    );
                  })}
                  {/* 견적 비교표 — 입찰 안건. 업체명은 상호라 공개용에서도 가리지 않는다
                      (개찰 결과 공개는 사업자 선정 절차의 관행이고 개인 성명이 아니다) */}
                  {a.quotes && a.quotes.length > 0 && (
                    <table className="mt-[2mm] w-full border-collapse break-inside-avoid">
                      <thead>
                        <tr>
                          <th className={th2}>응찰 업체</th>
                          <th className={`${th2} w-[30mm]`}>투찰 금액</th>
                          <th className={`${th2} w-[26mm]`}>비고</th>
                        </tr>
                      </thead>
                      <tbody>
                        {a.quotes.map((q, j) => (
                          <tr key={j}>
                            <td className={td2}>{q.vendor}</td>
                            <td className={`${td2} text-right`}>
                              {q.amount !== null
                                ? `${q.amount.toLocaleString()}원`
                                : "-"}
                            </td>
                            <td className={td2}>{q.note}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </td>
                <td className={`${td} text-center font-bold`}>
                  {a.decision === "가결"
                    ? "가"
                    : a.decision === "부결"
                      ? "부"
                      : "-"}
                </td>
                <td className={td}>
                  {a.decision === "없음" ? (
                    <span className="text-[var(--gian-ink-soft)]">
                      의결 없는 보고 안건
                    </span>
                  ) : (
                    <>
                      <p>
                        제{a.order}호 안건에 대하여{" "}
                        {voted
                          ? `찬성 ${c.for}, 반대 ${c.against}, 기권 ${c.abstain}으로 ${a.decision}됨`
                          : `${a.decision}으로 결정함`}
                      </p>
                      {a.votes && (
                        <div className="mt-[1mm] text-[9.5pt]">
                          {(
                            [
                              ["찬성", a.votes.for],
                              ["반대", a.votes.against],
                              ["기권", a.votes.abstain],
                            ] as const
                          )
                            .filter(([, names]) => names.length > 0)
                            .map(([label, names]) => (
                              <p key={label} className="-indent-[1em] pl-[1em]">
                                - {label}({names.length}명) :{" "}
                                {names.map(nm).join(", ")}
                              </p>
                            ))}
                        </div>
                      )}
                    </>
                  )}
                </td>
              </tr>
            );
          })}
          {agendas.length === 0 && (
            <tr>
              <td className={`${td} text-center`} colSpan={3}>
                등록된 안건이 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {/* ── 주요 발언내용: 준칙 [별첨3 제3호서식] — 공개 시 발언자 비식별 대상 ── */}
      <section className="mt-[7mm]">
        {/* 준칙 제3호서식의 회의일자·작성자 머리글은 낱장(별지) 식별용이라 싣지 않는다 —
            연속 문서에서는 상단 정보 표·작성자 줄·마감 블록과 중복이다 */}
        <h3 className="mb-[2mm] text-center text-[13pt] font-extrabold tracking-[.2em] indent-[.2em]">
          주요 발언내용
        </h3>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={`${th} w-[40mm]`}>발언자</th>
              <th className={th}>발언 내용</th>
            </tr>
          </thead>
          <tbody>
            {agendas.flatMap((a) =>
              a.discussion.map((l, j) => {
                const sp = toSpeech(l);
                return (
                  <tr
                    key={`${a.order}-${j}`}
                    className="break-inside-avoid align-top"
                  >
                    <td className={td}>{speakerText(sp) || "-"}</td>
                    <td className={td}>{sp.text}</td>
                  </tr>
                );
              }),
            )}
            {agendas.every((a) => a.discussion.length === 0) && (
              <tr>
                <td className={`${td} text-center`} colSpan={2}>
                  기록된 발언이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* ── 마감 블록 — 의사록 공통 관행: 폐회 → 확인 문구 → 작성일 → 발행 주체 → 서명 ──
          블록 전체를 한 덩어리로 묶지 않는다: ~10cm 덩어리가 통째로 다음 쪽에
          점프하면 앞 쪽 하단에 큰 공백이 남는다("여백이 많은데도 밀리는" 현상).
          문장은 줄 단위로 흐르고, 쪼개면 안 되는 최소 단위(작성일·발행 주체·서명표)만
          묶는다 — 꽉 찬 쪽은 전부 같은 바닥선에서 끝나 쪽마다 남는 여백이 통일된다 */}
      <section className="mt-[8mm]">
        <p>이상으로 제{meetingNo}차 입주자대표회의를 폐회함.</p>
        <p className="mt-[2mm]">
          위 회의의 경과와 결과가 사실과 다름없음을 확인하고, 참석한 동별
          대표자가 서명(또는 날인) 한다.
        </p>
        <div className="break-inside-avoid">
        <p className="mt-[12mm] text-center text-[11pt]">{issuedDate}</p>
        <p className="mt-[2mm] mb-[4mm] text-center text-[13pt] font-bold">
          {tenantName} 입주자대표회의
        </p>
        {/* 게시본은 서명부를 뺀다 — 자필 서명 필적·전자서명 기록도 개인정보라
            게시판 노출 대상이 아니고, 빈 서명칸은 게시물에서 기능이 없다.
            공개 의무(준칙 제43조②)의 대상은 경과와 결과지 서명부가 아니다 */}
        {masked ? (
          <p className="mt-[3mm] text-center text-[10pt] text-[var(--gian-ink-soft)]">
            (서명부는 게시본에서 생략합니다. 원본 회의록은 관리사무소에
            보관되어 있습니다)
          </p>
        ) : (
          signTable
        )}
        </div>
      </section>

      {/* 전자서명 증적 표 — 준칙에 없는 디벅 고유의 증거력 장치. 1건 이상일 때만 */}
      {!masked && steps.some((s) => s.status === "approved") && (
        <section className="mt-[6mm] break-inside-avoid text-[var(--gian-ink-soft)]">
          <p className="mb-[1mm] text-[9pt] font-bold">전자서명 기록</p>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={`${th2} w-[26mm]`}>성명</th>
                <th className={`${th2} w-[34mm]`}>일시</th>
                <th className={th2}>방식</th>
              </tr>
            </thead>
            <tbody>
              {steps
                .filter((s) => s.status === "approved")
                .map((s) => (
                  <tr key={s.order}>
                    <td className={td2}>{nm(s.name)}</td>
                    <td className={td2}>
                      {s.actedAt ? ymdhmKst(s.actedAt) : ""}
                    </td>
                    <td className={td2}>전자(링크)</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      )}
    </article>
  );
}
