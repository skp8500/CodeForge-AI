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
