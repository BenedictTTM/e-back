import { Injectable, Logger, ConflictException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { TokenService } from './token.service';
import { OAuthUserDto } from '../dto/oauth-user.dto';
import * as argon2 from 'argon2';


@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
    private readonly configService: ConfigService,
  ) { }

  async authenticateOAuthUser(oauthUser: OAuthUserDto) {
    try {
      let user = await this.prisma.user.findUnique({
        where: { email: oauthUser.email },
        select: {
          id: true, email: true, username: true, firstName: true,
          lastName: true, profilePic: true, role: true, createdAt: true, isDeleted: true,
        },
      });

      if (user) {
        if (user.isDeleted) {
          throw new ConflictException('This account has been deactivated');
        }
        user = await this.updateUserProfile(user.id, oauthUser);
      } else {
        user = await this.createOAuthUser(oauthUser);
      }

      const tokens = await this.tokenService.generateTokens(user.id, user.email, user.role);
      await this.tokenService.storeRefreshToken(user.id, tokens.refresh_token);

      return {
        success: true,
        message: 'OAuth authentication successful',
        user,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
      };
    } catch (error) {
      this.logger.error(`OAuth failed: ${error.message}`, error.stack);
      if (error instanceof ConflictException) throw error;
      throw new InternalServerErrorException('Failed to process OAuth login');
    }
  }

  private async createOAuthUser(oauthUser: OAuthUserDto) {
    try {
      const baseUsername = oauthUser.email.split('@')[0];
      const username = await this.generateUniqueUsername(baseUsername);

      const randomPassword = this.generateSecurePassword();
      const passwordHash = await argon2.hash(randomPassword);

      const user = await this.prisma.user.create({
        data: {
          email: oauthUser.email,
          username,
          passwordHash,
          firstName: oauthUser.firstName || '',
          lastName: oauthUser.lastName || '',
          profilePic: oauthUser.profilePic,
          role: 'USER',
        },
        select: {
          id: true, email: true, username: true, firstName: true,
          lastName: true, profilePic: true, role: true, createdAt: true, isDeleted: true,
        },
      });

      this.logger.log(`OAuth user created: ${user.email}`);
      return user;
    } catch (error) {
      this.logger.error('Failed to create OAuth user:', error);
      throw new InternalServerErrorException('Failed to create user account');
    }
  }

  private async updateUserProfile(userId: number, oauthUser: OAuthUserDto) {
    try {
      const user = await this.prisma.user.update({
        where: { id: userId },
        data: {
          firstName: oauthUser.firstName || undefined,
          lastName: oauthUser.lastName || undefined,
          profilePic: oauthUser.profilePic || undefined,
        },
        select: {
          id: true, email: true, username: true, firstName: true,
          lastName: true, profilePic: true, role: true, createdAt: true, isDeleted: true,
        },
      });
      return user;
    } catch (error) {
      this.logger.error('Failed to update user profile:', error);
      throw new InternalServerErrorException('Failed to update profile');
    }
  }

  private async generateUniqueUsername(baseUsername: string): Promise<string> {
    let username = baseUsername.toLowerCase().replace(/[^a-z0-9]/g, '');

    if (username.length < 3) {
      username = `user${username}`;
    }

    const existingUser = await this.prisma.user.findUnique({ where: { username } });
    if (!existingUser) return username;

    let attempt = 0;
    while (attempt < 10) {
      const candidateUsername = `${username}${Math.floor(Math.random() * 10000)}`;
      const exists = await this.prisma.user.findUnique({ where: { username: candidateUsername } });
      if (!exists) return candidateUsername;
      attempt++;
    }

    return `${username}${Date.now()}`;
  }

  private generateSecurePassword(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < 64; i++) {
      password += chars[Math.floor(Math.random() * chars.length)];
    }
    return password;
  }
}
