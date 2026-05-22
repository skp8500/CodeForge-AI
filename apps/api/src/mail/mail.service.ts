import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private readonly transporter: Transporter;
  private readonly from: string;
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly config: ConfigService) {
    this.from = config.get<string>('SMTP_FROM', 'noreply@codeforge.dev');

    this.transporter = nodemailer.createTransport({
      host: config.getOrThrow<string>('SMTP_HOST'),
      port: config.get<number>('SMTP_PORT', 587),
      secure: config.get<string>('SMTP_SECURE') === 'true',
      auth: {
        user: config.getOrThrow<string>('SMTP_USER'),
        pass: config.getOrThrow<string>('SMTP_PASS'),
      },
    });
  }

  async sendOrgInvite(to: string, orgName: string, inviteUrl: string): Promise<void> {
    const html = `
<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"></head>
<body style="font-family:system-ui,sans-serif;background:#0f172a;color:#f1f5f9;margin:0;padding:40px 20px">
  <div style="max-width:480px;margin:0 auto;background:#1e293b;border-radius:12px;padding:40px;border:1px solid #334155">
    <h1 style="margin:0 0 8px;font-size:24px;color:#3b82f6">CodeForge AI</h1>
    <h2 style="margin:0 0 16px;font-size:18px">You've been invited</h2>
    <p style="margin:0 0 24px;color:#cbd5e1;line-height:1.6">
      You've been invited to join <strong>${orgName}</strong> on CodeForge AI.
      Click the button below to accept — the link expires in <strong>7 days</strong>.
    </p>
    <a href="${inviteUrl}" style="display:inline-block;background:#3b82f6;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">
      Accept Invitation
    </a>
    <p style="margin:24px 0 0;font-size:12px;color:#64748b">
      Or copy this URL: <a href="${inviteUrl}" style="color:#60a5fa;word-break:break-all">${inviteUrl}</a>
    </p>
  </div>
</body></html>`;

    try {
      await this.transporter.sendMail({
        from: `"CodeForge AI" <${this.from}>`,
        to,
        subject: `You've been invited to join ${orgName} on CodeForge AI`,
        html,
      });
    } catch (err) {
      this.logger.error(`Failed to send org invite email to ${to}`, err);
      throw err;
    }
  }

  async sendAssessmentInvite(
    to: string,
    assessmentTitle: string,
    orgName: string,
    assessmentUrl: string,
    startsAt: Date,
    durationMinutes: number,
  ): Promise<void> {
    const dateStr = startsAt.toUTCString();
    const html = `
<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"></head>
<body style="font-family:system-ui,sans-serif;background:#0f172a;color:#f1f5f9;margin:0;padding:40px 20px">
  <div style="max-width:480px;margin:0 auto;background:#1e293b;border-radius:12px;padding:40px;border:1px solid #334155">
    <h1 style="margin:0 0 8px;font-size:24px;color:#3b82f6">CodeForge AI</h1>
    <h2 style="margin:0 0 16px;font-size:18px">Assessment Invitation</h2>
    <p style="margin:0 0 16px;color:#cbd5e1;line-height:1.6">
      <strong>${orgName}</strong> has invited you to take a coding assessment:
    </p>
    <div style="background:#0f172a;border-radius:8px;padding:16px;margin:0 0 24px">
      <p style="margin:0 0 8px;font-size:16px;font-weight:600;color:#f1f5f9">${assessmentTitle}</p>
      <p style="margin:0 0 4px;font-size:13px;color:#94a3b8">Starts: ${dateStr}</p>
      <p style="margin:0;font-size:13px;color:#94a3b8">Duration: ${durationMinutes} minutes</p>
    </div>
    <p style="margin:0 0 24px;color:#cbd5e1;font-size:14px">
      Your link is unique to you — do not share it. Click to begin when the assessment opens.
    </p>
    <a href="${assessmentUrl}" style="display:inline-block;background:#3b82f6;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">
      Open Assessment
    </a>
    <p style="margin:24px 0 0;font-size:12px;color:#64748b">
      Or copy this URL: <a href="${assessmentUrl}" style="color:#60a5fa;word-break:break-all">${assessmentUrl}</a>
    </p>
  </div>
</body></html>`;

    try {
      await this.transporter.sendMail({
        from: `"CodeForge AI" <${this.from}>`,
        to,
        subject: `Assessment invitation: ${assessmentTitle}`,
        html,
      });
    } catch (err) {
      this.logger.error(`Failed to send assessment invite email to ${to}`, err);
      throw err;
    }
  }

  async sendVerificationEmail(to: string, token: string): Promise<void> {
    const apiUrl = this.config.getOrThrow<string>('NEXT_PUBLIC_API_URL');
    const verificationUrl = `${apiUrl}/api/v1/auth/verify-email?token=${token}`;

    const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:system-ui,sans-serif;background:#0f172a;color:#f1f5f9;margin:0;padding:40px 20px">
  <div style="max-width:480px;margin:0 auto;background:#1e293b;border-radius:12px;padding:40px;border:1px solid #334155">
    <h1 style="margin:0 0 8px;font-size:24px;color:#3b82f6">CodeForge AI</h1>
    <p style="margin:0 0 24px;font-size:14px;color:#94a3b8">AI-powered coding judge platform</p>
    <h2 style="margin:0 0 16px;font-size:18px">Verify your email</h2>
    <p style="margin:0 0 24px;color:#cbd5e1;line-height:1.6">
      Click the button below to verify your email address. This link expires in <strong>24 hours</strong>.
    </p>
    <a href="${verificationUrl}"
       style="display:inline-block;background:#3b82f6;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">
      Verify Email
    </a>
    <p style="margin:24px 0 0;font-size:12px;color:#64748b">
      If you didn't create an account, you can safely ignore this email.
      <br><br>
      Or copy this URL: <a href="${verificationUrl}" style="color:#60a5fa;word-break:break-all">${verificationUrl}</a>
    </p>
  </div>
</body>
</html>`;

    try {
      await this.transporter.sendMail({
        from: `"CodeForge AI" <${this.from}>`,
        to,
        subject: 'Verify your CodeForge AI account',
        html,
      });
    } catch (err) {
      this.logger.error(`Failed to send verification email to ${to}`, err);
      throw err;
    }
  }
}
