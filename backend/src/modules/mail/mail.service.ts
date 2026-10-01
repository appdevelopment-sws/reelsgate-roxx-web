import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import * as handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';

export interface SendEmailOptions {
  to: string;
  subject: string;
  template: string;
  context: Record<string, any>;
}

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private readonly templateCache = new Map<
    string,
    handlebars.TemplateDelegate
  >();

  constructor(private readonly configService: ConfigService) {
    this.initTransporter();
  }

  async onModuleInit() {
    if (this.transporter) {
      await this.verifyConnection();
    }
  }

  /**
   * Initialize Nodemailer Transporter using Hostinger SMTP
   */
  private initTransporter() {
    const user =
      this.configService.get<string>('MAIL_EMAIL')?.trim() ||
      this.configService.get<string>('MAIL_USER')?.trim();
    const pass =
      this.configService.get<string>('MAIL_PASSWORD')?.trim() ||
      this.configService.get<string>('MAIL_PASS')?.trim();

    if (!user || !pass) {
      this.logger.warn(
        '⚠️ MAIL_EMAIL (or MAIL_USER) and MAIL_PASSWORD are not set in environment. Outgoing emails will be mocked in console.',
      );
      return;
    }

    // Hostinger SMTP host (default: smtp.hostinger.com)
    const host =
      this.configService.get<string>('MAIL_HOST')?.trim() ||
      'smtp.hostinger.com';

    // Hostinger port: 465 (SSL) or 587 (TLS/STARTTLS)
    const rawPort = this.configService.get<string | number>('MAIL_PORT');
    const port = rawPort ? Number(rawPort) : 465;

    // Secure: true for 465, false for 587
    const rawSecure = this.configService.get<string | boolean>('MAIL_SECURE');
    const secure =
      rawSecure !== undefined && rawSecure !== ''
        ? String(rawSecure).toLowerCase() === 'true'
        : port === 465;

    try {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: {
          user,
          pass,
        },
        tls: {
          rejectUnauthorized: true,
        },
      });

      this.logger.log(
        `📧 MailService initialized with Hostinger SMTP (${host}:${port}, secure=${secure}, user=${user})`,
      );
    } catch (error: any) {
      this.logger.error(
        'Failed to initialize nodemailer transporter',
        error?.stack || error,
      );
    }
  }

  /**
   * Verify Hostinger SMTP connection on startup or on demand
   */
  async verifyConnection(): Promise<boolean> {
    if (!this.transporter) {
      this.logger.warn(
        'Hostinger SMTP verify skipped: Transporter not initialized (missing credentials)',
      );
      return false;
    }

    try {
      await this.transporter.verify();
      this.logger.log('✅ Hostinger SMTP server connection verified successfully.');
      return true;
    } catch (error: any) {
      this.logger.error(
        `❌ Hostinger SMTP verification failed: ${error?.message || error}. Check MAIL_HOST, MAIL_PORT, MAIL_EMAIL, and MAIL_PASSWORD in your .env.`,
      );
      return false;
    }
  }

  /**
   * Compile and cache Handlebars template from file system
   */
  private getCompiledTemplate(
    templateName: string,
  ): handlebars.TemplateDelegate {
    if (this.templateCache.has(templateName)) {
      return this.templateCache.get(templateName)!;
    }

    // Check multiple candidate directories (src vs dist)
    const candidatePaths = [
      path.join(__dirname, 'templates', `${templateName}.hbs`),
      path.join(
        process.cwd(),
        'src',
        'modules',
        'mail',
        'templates',
        `${templateName}.hbs`,
      ),
      path.join(
        process.cwd(),
        'dist',
        'modules',
        'mail',
        'templates',
        `${templateName}.hbs`,
      ),
    ];

    let templateContent: string | null = null;
    for (const candidatePath of candidatePaths) {
      if (fs.existsSync(candidatePath)) {
        templateContent = fs.readFileSync(candidatePath, 'utf8');
        break;
      }
    }

    if (!templateContent) {
      throw new Error(
        `Email template '${templateName}.hbs' not found in candidate paths: ${candidatePaths.join(', ')}`,
      );
    }

    const compiled = handlebars.compile(templateContent);
    this.templateCache.set(templateName, compiled);
    return compiled;
  }

  /**
   * Send Email with HTML template
   */
  async sendEmail(options: SendEmailOptions): Promise<boolean> {
    const senderEmail =
      this.configService.get<string>('MAIL_FROM_ADDRESS')?.trim() ||
      this.configService.get<string>('MAIL_EMAIL')?.trim() ||
      this.configService.get<string>('MAIL_USER')?.trim() ||
      'noreply@reelsgate.com';

    const senderName =
      this.configService.get<string>('MAIL_FROM_NAME')?.trim() || 'Reelsgate';

    const fromAddress = `"${senderName}" <${senderEmail}>`;

    const template = this.getCompiledTemplate(options.template);
    const html = template({
      ...options.context,
      currentYear: new Date().getFullYear(),
    });

    // If transporter is not configured (e.g. local test without env set), log fallback
    if (!this.transporter) {
      this.logger.warn(
        `[DEV-MOCK] Email not sent via SMTP (Missing credentials). Destination: ${options.to}, Subject: "${options.subject}"`,
      );
      this.logger.debug(
        `[DEV-MOCK-CONTENT] ${JSON.stringify(options.context)}`,
      );
      return true;
    }

    try {
      const info = await this.transporter.sendMail({
        from: fromAddress,
        to: options.to,
        subject: options.subject,
        html,
      });

      this.logger.log(
        `✅ Email sent to ${options.to}. MessageId: ${info.messageId}`,
      );
      return true;
    } catch (error: any) {
      this.logger.error(
        `❌ Failed to send email to ${options.to}: ${error?.message || error}`,
      );
      throw error;
    }
  }

  /**
   * Send Registration Verification OTP Email
   */
  async sendRegistrationOtp(
    to: string,
    name: string,
    otp: string,
    expiresInMinutes: number = 10,
  ): Promise<boolean> {
    return this.sendEmail({
      to,
      subject: `${otp} is your Reelsgate verification code`,
      template: 'registration-otp',
      context: {
        name,
        otp,
        expiresInMinutes,
      },
    });
  }

  /**
   * Send Forgot Password Reset OTP Email
   */
  async sendPasswordResetOtp(
    to: string,
    name: string,
    otp: string,
    expiresInMinutes: number = 10,
  ): Promise<boolean> {
    return this.sendEmail({
      to,
      subject: `${otp} is your Reelsgate password reset code`,
      template: 'password-reset-otp',
      context: {
        name,
        otp,
        expiresInMinutes,
      },
    });
  }
}

