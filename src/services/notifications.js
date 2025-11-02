// server/src/services/notifications.js
import nodemailer from 'nodemailer';
import twilio from 'twilio';

let mailTransporter;
async function createTransporter() {
  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      },
      pool: true
    });
  } else {
    // Ethereal test account for dev
    const testAccount = await nodemailer.createTestAccount();
    console.log('Ethereal account:', testAccount.user, testAccount.pass);
    return nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      auth: { user: testAccount.user, pass: testAccount.pass }
    });
  }
}

let twilioClient = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

export async function sendEmail(to, subject, html) {
  if (process.env.NOTIFY_EMAIL_ENABLED === 'false') return null;
  mailTransporter = mailTransporter || await createTransporter();

  try {
    const info = await mailTransporter.sendMail({
      from: process.env.NOTIFY_EMAIL_FROM || 'no-reply@ai-mart.com',
      to,
      subject,
      html
    });

    const url = nodemailer.getTestMessageUrl(info);
    if (url) console.log('📧 Preview Email at:', url);
    return info;
  } catch (err) {
    console.error('sendEmail error:', err.message);
  }
}

export async function sendSms(to, text) {
  if (process.env.NOTIFY_SMS_ENABLED === 'false') return null;
  if (!twilioClient) {
    console.warn('⚠️ Twilio not configured, skipping SMS:', text);
    return null;
  }
  try {
    return await twilioClient.messages.create({
      body: text,
      from: process.env.TWILIO_FROM,
      to
    });
  } catch (err) {
    console.error('sendSms error:', err.message);
  }
}
