import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as crypto from 'crypto';
import * as argon2 from 'argon2';
import { EmailService } from '../../email/email.service';

@Injectable()
export class PasswordResetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) { }

  async requestPasswordReset(email: string): Promise<{ message: string; resetToken?: string }> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { email },
        select: { id: true, email: true }
      });

      if (!user) {
        throw new NotFoundException('No account found with this email address');
      }

      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetExpires = new Date(Date.now() + 3600000); // 1 hour

      await this.prisma.user.update({
        where: { email },
        data: {
          passwordResetToken: resetToken,
          passwordResetExpires: resetExpires
        }
      });

      await this.emailService.sendPasswordResetEmail(user.email, resetToken);

      return {
        message: 'Password reset link has been sent to your email',
        resetToken
      };

    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new BadRequestException('Failed to process password reset request');
    }
  }

  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    try {
      const user = await this.prisma.user.findFirst({
        where: {
          passwordResetToken: token,
          passwordResetExpires: { gt: new Date() }
        },
        select: { id: true, email: true }
      });

      if (!user) {
        throw new BadRequestException('Invalid or expired reset token');
      }

      const hashedPassword = await argon2.hash(newPassword);

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash: hashedPassword,
          passwordResetToken: null,
          passwordResetExpires: null
        }
      });

      return { message: 'Password has been reset successfully' };

    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('Failed to reset password');
    }
  }
}