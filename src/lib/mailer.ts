/**
 * 메일 발송 — SMTP 직결(nodemailer).
 *
 * 벤더 SDK를 쓰지 않는 이유: 네이버웍스·구글 워크스페이스 같은 국내에서 쓰는
 * 메일 계정을 그대로 붙일 수 있고, 발송사를 바꿔도 .env만 갈아끼우면 된다.
 *
 * SMTP_* 가 없으면 발송 기능은 꺼진 상태로 동작한다(카카오 로그인과 같은 규칙) —
 * 화면에서 `mailerEnabled()`로 분기해 "운영자에게 문의" 안내를 대신 띄운다.
 */
import nodemailer from "nodemailer";

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

/** 발송 인프라가 설정돼 있는지 — 꺼져 있으면 셀프 재설정 대신 수동 재설정으로 안내한다 */
export function mailerEnabled() {
  return !!(SMTP_HOST && SMTP_USER && SMTP_PASS);
}

/** 메일 링크에 쓰는 절대 주소 — 배포 시 반드시 실제 도메인으로 */
export const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

let transporter: nodemailer.Transporter | null = null;
function getTransporter() {
  transporter ??= nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 465,
    secure: process.env.SMTP_SECURE !== "false", // 465 = 기본 true
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return transporter;
}

const FROM = process.env.SMTP_FROM ?? `"디벅" <${SMTP_USER}>`;

/**
 * 발송 1회 + 실패 시 3초 후 1회 재시도.
 * 메일 서버는 순간적으로 연결이 끊기는 일이 흔해서, 한 번의 실패로
 * "재설정 메일이 안 왔다"는 문의가 생기는 걸 막는다.
 */
async function send(to: string, subject: string, html: string) {
  if (!mailerEnabled()) throw new Error("SMTP_HOST·SMTP_USER·SMTP_PASS 미설정");
  const mail = { from: FROM, to, subject, html };
  try {
    await getTransporter().sendMail(mail);
  } catch (err) {
    console.error(`[mailer] 발송 실패, 재시도: ${to} "${subject}"`, err);
    await new Promise((r) => setTimeout(r, 3000));
    await getTransporter().sendMail(mail);
  }
}

/**
 * HTML 본문에 들어가는 사용자 입력은 전부 이걸 통과시킨다.
 * 문서 제목·이름·단지명은 사용자가 치는 값이고, 이 메일은 외부 결재자(회장·감사)에게
 * 우리 발신 주소로 나간다 — 이스케이프하지 않으면 제목에 태그를 넣어 가짜 링크를
 * 우리 이름으로 실어 보낼 수 있다. 제목(subject)은 HTML이 아니므로 여기 안 태운다.
 */
export const escapeHtml = (s: string) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

/** 공통 레이아웃 — 본문 + 버튼 하나(없어도 된다 — 소집 통지처럼 열람 대상이 없는 안내).
 *  메일 클라이언트는 CSS를 못 믿으니 인라인 스타일만 */
function layout(bodyHtml: string, cta?: { label: string; url: string; danger?: boolean }) {
  let ctaHtml = "";
  if (cta) {
    const bg = cta.danger ? "#dc2626" : "#2563eb";
    // url도 이스케이프 — receiptUrl은 토스가 주는 외부 값이라 href="..." 를 깨고 나올 수 있다
    const url = escapeHtml(cta.url);
    ctaHtml = `
      <a href="${url}" style="display:inline-block;margin:20px 0;padding:12px 24px;background:${bg};color:#fff;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;">
        ${cta.label}
      </a>
      <p style="color:#64748b;font-size:13px;margin-top:8px;">
        버튼이 눌리지 않으면 아래 주소를 브라우저에 붙여넣어 주세요.<br/>${url}
      </p>`;
  }
  return `
    <div style="font-family:-apple-system,'Malgun Gothic',sans-serif;max-width:520px;margin:0 auto;color:#0f172a;line-height:1.7;">
      <p style="font-size:18px;font-weight:bold;color:#2563eb;margin:0 0 20px;">디벅</p>
      ${bodyHtml}${ctaHtml}
    </div>`;
}

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const ymd = (d: Date) =>
  new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10).replace(/-/g, ".");

/** 결제·체험 안내는 전부 실패해도 크론을 멈추지 않는다 — 메일 하나 때문에 청구가 밀리면 안 된다 */
export async function trySend(fn: () => Promise<void>) {
  try {
    await fn();
  } catch (err) {
    console.error("[mailer] 안내 메일 발송 실패", err);
  }
}

// ── 외부 결재 요청 (기안·품의 모듈 — 입주자대표회장·감사) ─────────
export async function sendApprovalRequest(
  to: string,
  name: string,
  tenantName: string,
  docTitle: string,
  token: string,
) {
  await send(
    to,
    `[디벅] ${tenantName} 결재 요청 — ${docTitle}`,
    layout(
      `<p>${escapeHtml(name)}님, 안녕하세요.</p>
       <p><b>${escapeHtml(tenantName)}</b> 관리사무소에서 결재를 요청했습니다.</p>
       <p style="margin:4px 0;"><b>${escapeHtml(docTitle)}</b></p>
       <p>아래 버튼을 눌러 문서를 확인하고 승인 또는 반려해 주세요.<br/>
       링크는 <b>7일</b> 동안 유효하며, 별도 로그인 없이 처리할 수 있습니다.</p>`,
      { label: "문서 확인하고 결재하기", url: `${APP_URL}/approve/${token}` },
    ),
  );
}

// ── 회의록 전자서명 요청 (입대의 — approve와 별도 라우트) ─────────
export async function sendSignatureRequest(
  to: string,
  name: string,
  tenantName: string,
  docTitle: string,
  token: string,
) {
  await send(
    to,
    `[디벅] ${tenantName} 회의록 서명 요청: ${docTitle}`,
    layout(
      `<p>${escapeHtml(name)}님, 안녕하세요.</p>
       <p><b>${escapeHtml(tenantName)}</b> 관리사무소에서 회의록 서명을 요청했습니다.</p>
       <p style="margin:4px 0;"><b>${escapeHtml(docTitle)}</b></p>
       <p>아래 버튼을 눌러 회의록을 확인하고 서명해 주세요.<br/>
       링크는 <b>7일</b> 동안 유효하며, 별도 로그인 없이 처리할 수 있습니다.</p>`,
      { label: "회의록 확인하고 서명하기", url: `${APP_URL}/sign/${token}` },
    ),
  );
}

// ── 입대의 소집 통지 (회의록 모듈) ─────────────────────────────
/**
 * 준칙의 "수신확인이 되는 전자우편" 통지를 대신한다 — 열람할 앱 화면이 없는
 * 수신자(동별 대표자)라 버튼 없이 내용 전문을 본문에 싣는다.
 */
export async function sendConvocationNotice(
  to: string,
  name: string,
  tenantName: string,
  meeting: { title: string; meetingAt: string; place: string; agenda: string[] },
) {
  const agendaHtml = meeting.agenda
    .map((t) => `<li style="margin:2px 0;">${escapeHtml(t)}</li>`)
    .join("");
  await send(
    to,
    `[디벅] ${tenantName} ${meeting.title} 소집 통지`,
    layout(
      `<p>${escapeHtml(name)}님, 안녕하세요.</p>
       <p><b>${escapeHtml(tenantName)}</b> ${escapeHtml(meeting.title)}가 아래와 같이 소집되었습니다.</p>
       <table style="border-collapse:collapse;margin:12px 0;font-size:14px;">
         <tr><td style="padding:8px 16px;background:#f1f5f9;font-weight:bold;">일시</td><td style="padding:8px 16px;">${escapeHtml(meeting.meetingAt)}</td></tr>
         <tr><td style="padding:8px 16px;background:#f1f5f9;font-weight:bold;">장소</td><td style="padding:8px 16px;">${escapeHtml(meeting.place)}</td></tr>
       </table>
       <p style="font-weight:bold;margin:12px 0 4px;">안건</p>
       <ol style="margin:0 0 12px;padding-left:20px;">${agendaHtml}</ol>
       <p style="color:#64748b;font-size:13px;">이 메일은 입주자대표회의 소집 통지를 위해 관리사무소에서 보냈습니다.</p>`,
    ),
  );
}

// ── 비밀번호 재설정 ────────────────────────────────────────────
export async function sendPasswordReset(to: string, name: string, token: string) {
  await send(
    to,
    "[디벅] 비밀번호 재설정 안내",
    layout(
      `<p>${escapeHtml(name)}님, 안녕하세요.</p>
       <p>비밀번호 재설정 요청이 접수되었습니다. 아래 버튼을 눌러 새 비밀번호를 설정해 주세요.<br/>
       링크는 <b>1시간</b> 동안만 유효하고, 한 번 사용하면 만료됩니다.</p>
       <p style="color:#64748b;font-size:14px;">본인이 요청하지 않았다면 이 메일을 무시해 주세요. 비밀번호는 바뀌지 않습니다.</p>`,
      { label: "새 비밀번호 설정하기", url: `${APP_URL}/reset-password/${token}` },
    ),
  );
}

// ── 무료 체험 ──────────────────────────────────────────────────
export async function sendTrialEndingSoon(
  to: string,
  name: string,
  moduleNames: string,
  daysLeft: number,
) {
  await send(
    to,
    `[디벅] 무료 체험이 ${daysLeft}일 남았습니다`,
    layout(
      `<p>${escapeHtml(name)}님, 안녕하세요.</p>
       <p><b>${escapeHtml(moduleNames)}</b> 무료 체험이 <b>${daysLeft}일</b> 뒤 종료됩니다.</p>
       <p>결제 카드를 등록해 두시면 체험이 끝나는 날 자동으로 이어집니다.
       입력하신 데이터와 설정은 그대로 유지됩니다.</p>`,
      { label: "결제 카드 등록하기", url: `${APP_URL}/billing` },
    ),
  );
}

export async function sendTrialExpired(to: string, name: string, moduleNames: string) {
  await send(
    to,
    "[디벅] 무료 체험이 종료되었습니다",
    layout(
      `<p>${escapeHtml(name)}님, 안녕하세요.</p>
       <p><b>${escapeHtml(moduleNames)}</b> 무료 체험이 끝나 해당 모듈이 잠겼습니다.</p>
       <p>결제 카드를 등록하시면 바로 다시 사용하실 수 있고, 그동안 입력하신 데이터도 그대로입니다.</p>`,
      { label: "결제 카드 등록하기", url: `${APP_URL}/billing` },
    ),
  );
}

// ── 결제 ───────────────────────────────────────────────────────
export async function sendRenewalNotice(
  to: string,
  name: string,
  amount: number,
  billingAt: Date,
  daysLeft: number,
) {
  await send(
    to,
    `[디벅] ${daysLeft}일 뒤 ${won(amount)}이 결제됩니다`,
    layout(
      `<p>${escapeHtml(name)}님, 안녕하세요.</p>
       <p><b>${ymd(billingAt)}</b>에 등록하신 카드로 <b>${won(amount)}</b>이 자동 결제될 예정입니다.</p>
       <p>카드 한도와 유효기간을 미리 확인해 주세요. 구독을 조정하시려면 결제 화면에서 변경하실 수 있습니다.</p>`,
      { label: "결제 정보 확인하기", url: `${APP_URL}/billing` },
    ),
  );
}

export async function sendPaymentSuccess(
  to: string,
  name: string,
  amount: number,
  nextAt: Date,
  receiptUrl?: string,
) {
  await send(
    to,
    `[디벅] ${won(amount)} 결제가 완료되었습니다`,
    layout(
      `<p>${escapeHtml(name)}님, 안녕하세요.</p>
       <p>정기 결제가 정상적으로 처리되었습니다.</p>
       <table style="border-collapse:collapse;margin:12px 0;font-size:14px;">
         <tr><td style="padding:8px 16px;background:#f1f5f9;font-weight:bold;">결제 금액</td><td style="padding:8px 16px;">${won(amount)}</td></tr>
         <tr><td style="padding:8px 16px;background:#f1f5f9;font-weight:bold;">다음 결제일</td><td style="padding:8px 16px;">${ymd(nextAt)}</td></tr>
       </table>`,
      { label: "영수증 보기", url: receiptUrl ?? `${APP_URL}/billing` },
    ),
  );
}

export async function sendPaymentFailed(
  to: string,
  name: string,
  reason: string,
  daysLeft: number,
) {
  await send(
    to,
    "[디벅] 결제에 실패했습니다 — 카드를 확인해 주세요",
    layout(
      `<p>${escapeHtml(name)}님, 안녕하세요.</p>
       <p>정기 결제가 처리되지 않았습니다.</p>
       <p style="color:#dc2626;">실패 사유: ${escapeHtml(reason)}</p>
       <p>매일 자동으로 다시 시도합니다. <b>${daysLeft}일</b> 안에 결제되지 않으면 서비스 이용이 일시 정지됩니다.
       카드 한도·유효기간을 확인하시거나 다른 카드로 바꿔 주세요.</p>`,
      { label: "결제 수단 변경하기", url: `${APP_URL}/billing`, danger: true },
    ),
  );
}

export async function sendSuspended(to: string, name: string) {
  await send(
    to,
    "[디벅] 서비스 이용이 일시 정지되었습니다",
    layout(
      `<p>${escapeHtml(name)}님, 안녕하세요.</p>
       <p>결제가 계속 실패해 서비스 이용이 일시 정지되었습니다. 모듈에 들어가실 수 없는 상태입니다.</p>
       <p><b>데이터는 그대로 보관되어 있습니다.</b> 카드를 바꾸고 결제하시면 즉시 다시 사용하실 수 있습니다.</p>`,
      { label: "지금 결제하고 이용 재개", url: `${APP_URL}/billing`, danger: true },
    ),
  );
}

// ── 안전보건 교육 미이수 안내 ──────────────────────────────────
/**
 * 반기 마감 전 미이수자 안내. 인앱 알림만으로는 몇 주 앱을 안 여는 소장에게
 * 닿지 않아 메일을 같이 보낸다 — 마감을 넘기면 과태료 대상이 된다.
 */
export async function sendTrainingDue(
  to: string,
  name: string,
  halfText: string,
  daysLeft: number,
  people: string[],
) {
  const list = people.map((p) => escapeHtml(p)).join(", ");
  await send(
    to,
    `[디벅] ${halfText} 안전보건교육 마감까지 ${daysLeft}일 — 미이수 ${people.length}명`,
    layout(
      `<p>${escapeHtml(name)}님, 안녕하세요.</p>
       <p><b>${escapeHtml(halfText)}</b> 정기 안전보건교육 마감까지 <b>${daysLeft}일</b> 남았습니다.
       법정 시간을 아직 못 채운 직원이 <b>${people.length}명</b> 있습니다.</p>
       <p style="color:#b45309;">${list}</p>
       <p>교육을 실시하고 일지를 남기면 이수 시간이 자동으로 집계됩니다.
       사무직은 매반기 6시간, 그 외 직원은 12시간이 법정 기준입니다.</p>`,
      { label: "교육일지 작성하기", url: `${APP_URL}/modules/safety-training` },
    ),
  );
}

// ── 법정점검 기한 경과 안내 ────────────────────────────────────
/**
 * 기한이 지난 법정점검 — 과태료 위험은 앱에 접속하지 않아도 닿아야 한다.
 * 인앱 알림·현황판 빨강과 별개로 소장에게 메일 1회(회차 키로 중복 방지).
 */
export async function sendInspectionOverdue(
  to: string,
  name: string,
  itemName: string,
  dueYmd: string,
  daysOver: number,
) {
  await send(
    to,
    `[디벅] ${itemName} 기한이 ${daysOver}일 지났습니다`,
    layout(
      `<p>${escapeHtml(name)}님, 안녕하세요.</p>
       <p><b>${escapeHtml(itemName)}</b>의 법정 기한(${dueYmd.replace(/-/g, ". ")}.)이
       <b>${daysOver}일</b> 지났습니다. 미실시 상태가 계속되면 과태료 대상이 될 수 있습니다.</p>
       <p>이미 점검을 마쳤다면 실시 기록만 남겨 주세요 — 기록을 저장하면 다음
       도래일이 자동으로 계산됩니다.</p>`,
      { label: "점검 기록 남기기", url: `${APP_URL}/modules/facilities`, danger: true },
    ),
  );
}

/**
 * 채용 시 교육 미이수 — 반기 마감이 아니라 **입사일** 기준이라 사람마다 시점이 다르다.
 * 법 문언은 "작업 배치 전"이라 유예를 길게 잡을 수 없다.
 */
export async function sendNewHireTrainingDue(
  to: string,
  name: string,
  staffName: string,
  daysSinceHire: number,
  hours: number,
) {
  await send(
    to,
    `[디벅] ${staffName}님 채용 시 안전보건교육이 아직 완료되지 않았습니다`,
    layout(
      `<p>${escapeHtml(name)}님, 안녕하세요.</p>
       <p><b>${escapeHtml(staffName)}</b>님이 입사한 지 <b>${daysSinceHire}일</b>이 지났는데,
       채용 시 안전보건교육이 <b>${hours}/8시간</b>으로 아직 완료되지 않았습니다.</p>
       <p>채용 시 교육은 작업에 배치하기 전에 실시해야 하는 법정 교육입니다.
       교육일지에서 <b>채용 시 교육</b>을 선택해 실시 기록을 남겨 주세요.</p>`,
      { label: "채용 시 교육일지 작성", url: `${APP_URL}/modules/safety-training/new` },
    ),
  );
}
