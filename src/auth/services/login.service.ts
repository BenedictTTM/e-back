import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { Response } from 'express';
import { LoginDto } from '../dto/login.dto';
import { UserValidationService } from './user-validation.service';
import { TokenService } from './token.service';

@Injectable()
export class LoginService {
  private readonly logger = new Logger(LoginService.name);

  constructor(
    private readonly userValidationService: UserValidationService,
    private readonly tokenService: TokenService,
  ) { }

  async login(loginDto: LoginDto) {
    this.logger.debug(`🔐 Login attempt for email: ${loginDto.email}`);

    try {
      // Validate user credentials - fix method name
      const user = await this.userValidationService.validateUserCredentials(
        loginDto.email,
        loginDto.password,
      );

      if (!user) {
        this.logger.warn(`❌ Invalid credentials for: ${loginDto.email}`);
        throw new UnauthorizedException('Invalid credentials');
      }

      this.logger.debug(`✅ User validated: ${user.email} (ID: ${user.id})`);

      // Generate tokens - fix arguments
      this.logger.debug('🔄 Generating JWT tokens...');
      const tokens = await this.tokenService.generateTokens(user.id, user.email, user.role);

      this.logger.debug('✅ Tokens generated successfully', {
        accessTokenLength: tokens.access_token.length,
        refreshTokenLength: tokens.refresh_token.length,
      });

      this.logger.log(`User logged in successfully: ${user.id}`);

      return {
        success: true,
        message: 'Login successful',
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
        },
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
      };
    } catch (error) {
      this.logger.error(`🚨 Login failed for ${loginDto.email}:`, error.message);
      throw error;
    }
  }


}