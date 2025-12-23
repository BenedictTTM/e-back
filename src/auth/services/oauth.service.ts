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
  ) {}

  async authenticateOAuthUser(oauthUser: OAuthUserDto) {
    try {
      this.logger.debug(`🔍 Processing OAuth login for: ${oauthUser.email}`);

      // Find existing user by email
      let user = await this.prisma.user.findUnique({
        where: { email: oauthUser.email },
        select: {
          id: true,
          email: true,
          username: true,
          firstName: true,
          lastName: true,
          profilePic: true,
          role: true,
          createdAt: true,
          isDeleted: true,
        },
      });

      if (user) {
        // Check if account is soft-deleted
        if (user.isDeleted) {
          throw new ConflictException('This account has been deactivated');
        }

        this.logger.log(`✅ Existing user found: ${user.email}`);
        
        // Update profile with latest OAuth data
        user = await this.updateUserProfile(user.id, oauthUser);
      } else {
        this.logger.log(`🆕 Creating new user from OAuth: ${oauthUser.email}`);
        
        // Create new user
        user = await this.createOAuthUser(oauthUser);
      }

      // Generate JWT tokens using existing TokenService
      const tokens = await this.tokenService.generateTokens(user.id, user.email, user.role);

      // Store refresh token using existing TokenService method
      await this.tokenService.storeRefreshToken(user.id, tokens.refresh_token);

      this.logger.log(`✅ OAuth authentication successful: ${user.email}`);

      return {
        success: true,
        message: 'OAuth authentication successful',
        user,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
      };
    } catch (error) {
      this.logger.error(`❌ OAuth authentication failed: ${error.message}`, error.stack);
      
      if (error instanceof ConflictException) {
        throw error;
      }
      
      throw new InternalServerErrorException('Failed to process OAuth login');
    }
  }


  private async createOAuthUser(oauthUser: OAuthUserDto) {
    try {
      // Generate unique username from email
      const baseUsername = oauthUser.email.split('@')[0];
      const username = await this.generateUniqueUsername(baseUsername);

      // Generate secure random password (even though OAuth doesn't use it)
      // This allows user to set password later if they want traditional login
      const randomPassword = this.generateSecurePassword();
      const passwordHash = await argon2.hash(randomPassword);

      // Create user with OAuth data
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
          id: true,
          email: true,
          username: true,
          firstName: true,
          lastName: true,
          profilePic: true,
          role: true,
          createdAt: true,
          isDeleted: true,
        },
      });

      this.logger.log(`✅ New OAuth user created: ${user.email}`);
      return user;
    } catch (error) {
      this.logger.error('❌ Failed to create OAuth user:', error);
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
          id: true,
          email: true,
          username: true,
          firstName: true,
          lastName: true,
          profilePic: true,
          role: true,
          createdAt: true,
          isDeleted: true,
        },
      });

      this.logger.log(`✅ User profile synced from OAuth: ${user.email}`);
      return user;
    } catch (error) {
      this.logger.error('❌ Failed to update user profile:', error);
      throw new InternalServerErrorException('Failed to update profile');
    }
  }

  private async generateUniqueUsername(baseUsername: string): Promise<string> {
    // Sanitize username: lowercase, remove special chars
    let username = baseUsername.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    // Ensure minimum length
    if (username.length < 3) {
      username = `user${username}`;
    }

    // Check if username exists
    const existingUser = await this.prisma.user.findUnique({
      where: { username },
    });

    if (!existingUser) {
      return username;
    }

    // Generate unique username with random suffix
    let attempt = 0;
    while (attempt < 10) {
      const randomSuffix = Math.floor(Math.random() * 10000);
      const candidateUsername = `${username}${randomSuffix}`;

      const exists = await this.prisma.user.findUnique({
        where: { username: candidateUsername },
      });

      if (!exists) {
        return candidateUsername;
      }

      attempt++;
    }

    // Fallback: use timestamp
    return `${username}${Date.now()}`;
  }


  private generateSecurePassword(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    const length = 64;

    // Generate cryptographically secure random password
    for (let i = 0; i < length; i++) {
      const randomIndex = Math.floor(Math.random() * chars.length);
      password += chars[randomIndex];
    }

    return password;
  }
}
