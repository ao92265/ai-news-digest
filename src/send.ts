import nodemailer from 'nodemailer';

export async function sendDigest(html: string, text: string, subject: string): Promise<unknown> {
  const host = process.env.SMTP_HOST;
  const portStr = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const to = process.env.DIGEST_TO_EMAIL;
  const from = process.env.DIGEST_FROM_EMAIL;

  if (!host || !portStr || !user || !pass || !to || !from) {
    throw new Error('Missing one of: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, DIGEST_TO_EMAIL, DIGEST_FROM_EMAIL');
  }

  const port = Number(portStr);
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  const info = await transporter.sendMail({
    from,
    to,
    subject,
    html,
    text,
  });

  return { messageId: info.messageId, accepted: info.accepted, rejected: info.rejected };
}
