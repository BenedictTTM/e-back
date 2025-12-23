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

  /**
   * Initiates Google OAuth flow
   * Redirects user to Google's consent screen
   * 
   * @route GET /auth/oauth/google
   */
  @Get('google')
  @UseGuards(GoogleOAuthGuard)
  async googleAuth() {
    // Guard redirects to Google - this method won't be called
    this.logger.log('🚀 [OAUTH] Initiating Google OAuth flow');
  }

  @Get('google/callback')
  @UseGuards(GoogleOAuthGuard)
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    try {
      this.logger.log('✅ [OAUTH] Google OAuth callback received');

      // Extract OAuth user from request (set by Passport strategy)
      const oauthUser = req.user as any;

      if (!oauthUser) {
        this.logger.warn('❌ [OAUTH] No user data in OAuth callback');
        return res.redirect(`${this.frontendUrl}/api/auth/oauth/callback?message=Authentication failed`);
      }

      this.logger.log(`🔍 [OAUTH] Processing OAuth user: ${oauthUser.email}`);

      // Authenticate or create user
      const result = await this.oauthService.authenticateOAuthUser(oauthUser);

      this.logger.log('🔑 [OAUTH] Tokens generated, sending in URL for proxy exchange');
      this.logger.log(`✅ [OAUTH] OAuth authentication successful for: ${result.user.email}`);

      // Instead of setting cookies here (which won't work cross-origin),
      // send tokens in URL to frontend proxy, which will set them as same-origin cookies
      const tokensParam = encodeURIComponent(
        JSON.stringify({
          access_token: result.access_token,
          refresh_token: result.refresh_token,
        })
      );

      this.logger.log(`🧭 [OAUTH] Redirecting to: ${this.frontendUrl}/auth/oauth-callback?oauth=success&tokens=...`);

      // Redirect to frontend OAuth proxy with tokens in URL
      return res.redirect(`${this.frontendUrl}/auth/oauth-callback?oauth=success&tokens=${tokensParam}`);
    } catch (error) {
      this.logger.error('❌ [OAUTH] OAuth callback failed:', error);
      this.logger.error('❌ [OAUTH] Error stack:', error.stack);

      // Redirect to frontend OAuth proxy with error
      const errorMessage = encodeURIComponent(
        error.message || 'Authentication failed'
      );
      return res.redirect(`${this.frontendUrl}/auth/oauth-callback?message=${errorMessage}`);
    }
  }


  @Get('success')
  async oauthSuccess(@Req() req: Request) {
    const user = req.user;

    return {
      success: true,
      user,
      message: 'OAuth authentication successful',
    };
  }


  @Get('error')
  async oauthError(@Req() req: Request) {
    const errorMessage = req.query.message || 'OAuth authentication failed';

    return {
      success: false,
      error: errorMessage,
      message: 'Please try again or use a different authentication method',
    };
  }

}
