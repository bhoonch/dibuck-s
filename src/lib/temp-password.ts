import { randomInt } from "node:crypto";

/** 임시 비밀번호 — 눈으로 읽고 전화로 불러줄 수 있게 헷갈리는 글자(0/O, 1/l/I)는 뺀다 */
export function tempPassword() {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length: 10 }, () => chars[randomInt(chars.length)]).join(
    "",
  );
}

export type TempPasswordResult =
  | { error: string }
  | { tempPassword: string; email: string; name: string }
  | undefined;
