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

/** 공통 레이아웃 — 본문 + 버튼 하나. 메일 클라이언트는 CSS를 못 믿으니 인라인 스타일만 */
function layout(bodyHtml: string, cta: { label: string; url: string; danger?: boolean }) {
  const bg = cta.danger ? "#dc2626" : "#2563eb";
  return `
    <div style="font-family:-apple-system,'Malgun Gothic',sans-serif;max-width:520px;margin:0 auto;color:#0f172a;line-height:1.7;">
      <p style="font-size:18px;font-weight:bold;color:#2563eb;margin:0 0 20px;">디벅</p>
      ${bodyHtml}
      <a href="${cta.url}" style="display:inline-block;margin:20px 0;padding:12px 24px;background:${bg};color:#fff;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;">
        ${cta.label}
      </a>
      <p style="color:#64748b;font-size:13px;margin-top:8px;">
        버튼이 눌리지 않으면 아래 주소를 브라우저에 붙여넣어 주세요.<br/>${cta.url}
      </p>
    </div>`;
}

// ── 비밀번호 재설정 ────────────────────────────────────────────
export async function sendPasswordReset(to: string, name: string, token: string) {
  await send(
    to,
    "[디벅] 비밀번호 재설정 안내",
    layout(
      `<p>${name}님, 안녕하세요.</p>
       <p>비밀번호 재설정 요청이 접수되었습니다. 아래 버튼을 눌러 새 비밀번호를 설정해 주세요.<br/>
       링크는 <b>1시간</b> 동안만 유효하고, 한 번 사용하면 만료됩니다.</p>
       <p style="color:#64748b;font-size:14px;">본인이 요청하지 않았다면 이 메일을 무시해 주세요. 비밀번호는 바뀌지 않습니다.</p>`,
      { label: "새 비밀번호 설정하기", url: `${APP_URL}/reset-password/${token}` },
    ),
  );
}
