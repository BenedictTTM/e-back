import { Injectable, ForbiddenException, UnauthorizedException, Logger } from '@nestjs/common';
import { TokenService } from './token.service';
import { UserValidationService } from './user-validation.service';


@Injectable()
export class RefreshTokenService {
  private readonly logger = new Logger(RefreshTokenService.name);

  constructor(
    private readonly tokenService: TokenService,
    private readonly userValidationService: UserValidationService,
  ) { }

  async refreshTokens(refreshToken: string) {
    try {
      let payload;
      try {
        payload = this.tokenService.verifyRefreshTokenJWT(refreshToken);
      } catch (jwtError) {
        throw new UnauthorizedException('Invalid refresh token signature');
      }

      const userId = payload.sub;

      const isValidToken = await this.tokenService.verifyRefreshToken(userId, refreshToken);
      if (!isValidToken) {
        throw new ForbiddenException('Invalid or expired refresh token');
      }

      const user = await this.userValidationService.getUserById(userId);
      if (!user) {
        throw new ForbiddenException('User not found');
      }
      if (user.isDeleted) {
        throw new ForbiddenException('User account has been deactivated');
      }

      const newTokens = await this.tokenService.generateTokens(user.id, user.email, user.role);

      // Token rotation: store new, invalidate old
      await this.tokenService.storeRefreshToken(user.id, newTokens.refresh_token);

      this.logger.log(`Token refreshed for user ${userId}`);

      return {
        success: true,
        message: 'Tokens refreshed successfully',
        access_token: newTokens.access_token,
        refresh_token: newTokens.refresh_token,
      };

    } catch (error) {
      if (error instanceof ForbiddenException || error instanceof UnauthorizedException) {
        throw error;
      }
      throw new ForbiddenException('Token refresh failed due to an unexpected error');
    }
  }
}