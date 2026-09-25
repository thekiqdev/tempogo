import nodemailer from "nodemailer";
import type { PlatformOptions } from "./platform.js";
export function platformMailSender(
  env: NodeJS.ProcessEnv,
  origin: string,
): PlatformOptions["sendMail"] {
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST ?? "127.0.0.1",
    port: Number(env.SMTP_PORT ?? 1025),
    secure: env.SMTP_SECURE === "true",
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 5000,
  });
  return async (email, raw, kind) => {
    await transport.sendMail({
      from: env.MAIL_FROM ?? "TempoGo <acesso@tempogo.local>",
      to: email,
      subject:
        kind === "notice" ? "Autenticador atualizado — TempoGo" : "Acesso à plataforma — TempoGo",
      text:
        kind === "notice"
          ? "Seu autenticador da plataforma foi configurado ou substituído. Se não reconhece a alteração, contate o responsável técnico."
          : kind === "email-notice"
            ? "O email de acesso da sua conta TempoGo foi alterado após confirmação. Se não reconhece a alteração, contate o responsável técnico imediatamente."
            : (kind === "invitation" || kind === "super-invitation"
                ? "Você recebeu um convite TempoGo. Use sua senha atual se já possui conta, ou defina uma nova senha. Válido por 24 horas.\n\n"
                : "Use este link uma única vez em até 30 minutos. Nunca compartilhe.\n\n") +
              origin +
              (kind === "user-password"
                ? "/reset#reset="
                : "/plataforma#" +
                  (kind === "invitation"
                    ? "invite"
                    : kind === "super-invitation"
                      ? "super-invite"
                      : kind === "email"
                        ? "email-change"
                        : kind === "password"
                          ? "reset"
                          : "mfa-reset") +
                  "=") +
              raw,
    });
  };
}
