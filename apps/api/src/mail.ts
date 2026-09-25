import nodemailer from "nodemailer";
export type SendReset = (email: string, rawToken: string) => Promise<void>;
export function mailSender(env: NodeJS.ProcessEnv, origin: string): SendReset {
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST ?? "127.0.0.1",
    port: Number(env.SMTP_PORT ?? 1025),
    secure: env.SMTP_SECURE === "true",
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 5000,
  });
  return async (email, rawToken) => {
    await transport.sendMail({
      from: env.MAIL_FROM ?? "TempoGo <acesso@tempogo.local>",
      to: email,
      subject: "Defina sua senha — TempoGo",
      text:
        "Use o link para definir sua senha. Ele expira em 30 minutos e funciona uma vez.\n\n" +
        origin +
        "/reset#reset=" +
        rawToken +
        "\n\nSe não solicitou, ignore esta mensagem.",
    });
  };
}
