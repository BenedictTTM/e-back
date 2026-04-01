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
    try {
      const user = await this.userValidationService.validateUserCredentials(
        loginDto.email,
        loginDto.password,
      );

      if (!user) {
        throw new UnauthorizedException('Invalid credentials');
      }

      const tokens = await this.tokenService.generateTokens(user.id, user.email, user.role);
      this.logger.log(`User logged in: ${user.id}`);

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
      this.logger.error(`Login failed for ${loginDto.email}: ${error.message}`);
      throw error;
    }
  }
}