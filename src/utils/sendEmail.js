import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendEmail(to, subject, html) {
  try {
    const data = await resend.emails.send({
      from: process.env.NOTIFY_EMAIL_FROM,
      to,
      subject,
      html
    });

    console.log("📩 Email sent:", data);
    return data;
  } catch (error) {
    console.error("❌ Resend email error:", error);
    throw error;
  }
}
