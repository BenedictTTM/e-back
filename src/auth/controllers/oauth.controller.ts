import { Controller, Get, Post, Body, Req, Res, UseGuards, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { GoogleOAuthGuard } from '../guards/google-oauth.guard';
import { OAuthService } from '../services/oauth.service';
import { ConfigService } from '@nestjs/config';


@Controller('auth/oauth')
export class OAuthController {
  private readonly logger = new Logger(OAuthController.name);
  private readonly frontendUrl: string;

  constructor(
    private readonly oauthService: OAuthService,
    private readonly configService: ConfigService,
  ) {
    this.frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
  }

  @Get('google')
  @UseGuards(GoogleOAuthGuard)
  async googleAuth() {
    this.logger.log('Initiating Google OAuth flow');
  }

  @Get('google/callback')
  @UseGuards(GoogleOAuthGuard)
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    try {
      const oauthUser = req.user as any;

      if (!oauthUser) {
        return res.redirect(`${this.frontendUrl}/api/auth/oauth/callback?message=Authentication failed`);
      }

      this.logger.log(`Processing OAuth user: ${oauthUser.email}`);
      const result = await this.oauthService.authenticateOAuthUser(oauthUser);

      // Send tokens via URL for frontend proxy to set as cookies
      const tokensParam = encodeURIComponent(
        JSON.stringify({
          access_token: result.access_token,
          refresh_token: result.refresh_token,
        })
      );

      return res.redirect(`${this.frontendUrl}/auth/oauth-callback?oauth=success&tokens=${tokensParam}`);
    } catch (error) {
      this.logger.error('OAuth callback failed:', error);
      const errorMessage = encodeURIComponent(error.message || 'Authentication failed');
      return res.redirect(`${this.frontendUrl}/auth/oauth-callback?message=${errorMessage}`);
    }
  }

  @Get('success')
  async oauthSuccess(@Req() req: Request) {
    return {
      success: true,
      user: req.user,
      message: 'OAuth authentication successful',
    };
  }

  @Get('error')
  async oauthError(@Req() req: Request) {
    return {
      success: false,
      error: req.query.message || 'OAuth authentication failed',
      message: 'Please try again or use a different authentication method',
    };
  }
}
