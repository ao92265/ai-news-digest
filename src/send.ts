import { Resend } from 'resend';

export async function sendDigest(html: string, text: string, subject: string): Promise<unknown> {
  const to = process.env.DIGEST_TO_EMAIL;
  const from = process.env.DIGEST_FROM_EMAIL;
  const key = process.env.RESEND_API_KEY;
  if (!to || !from || !key) {
    throw new Error('Missing one of: DIGEST_TO_EMAIL, DIGEST_FROM_EMAIL, RESEND_API_KEY');
  }
  const resend = new Resend(key);
  const { data, error } = await resend.emails.send({ from, to, subject, html, text });
  if (error) throw new Error(`Resend error: ${error.message}`);
  return data;
}
