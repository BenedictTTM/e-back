import { Controller, Get, Post, Body, Res, Req, UseGuards, UnauthorizedException, Logger } from '@nestjs/common';
import { Response, Request } from 'express';
import { LoginService } from './services/login.service';
import { SignupService } from './services/signup.service';
import { RefreshTokenService } from './services/refresh-token.service';
import { LogoutService } from './services/logout.service';
import { AuthGuard } from '../guards/auth.guard';
import { RefreshTokenGuard } from '../guards/refresh-token.guard';
import { GetUser } from '../decorators/user.decorators';
import { SignUpDto } from './dto/signUp.dto';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly loginService: LoginService,
    private readonly signupService: SignupService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly logoutService: LogoutService,
  ) { }

  @Post('login')
  async login(@Body() dto: LoginDto) {
    return this.loginService.login(dto);
  }

  @Post('signup')
  async signup(@Body() dto: SignUpDto) {
    return this.signupService.signup(dto);
  }


  @Post('refresh')
  @UseGuards(RefreshTokenGuard)
  async refresh(@Req() req: Request) {
    this.logger.debug('🔄 Token refresh request received');

    // RefreshTokenGuard attaches the user and refreshToken to the request
    // We can access the refresh token that was validated
    const refreshToken = (req as any).refreshToken;

    if (!refreshToken) {
      // This should be caught by the guard, but double check
      throw new UnauthorizedException('Refresh token required');
    }

    this.logger.debug('✅ Refresh token found, processing...');
    const result = await this.refreshTokenService.refreshTokens(refreshToken);

    this.logger.log('✅ Tokens refreshed successfully');
    return result;
  }

  @Post('logout')
  @UseGuards(AuthGuard)
  async logout(@GetUser() user: any) {
    return this.logoutService.logout(user.id);
  }


  @Get('session')
  @UseGuards(AuthGuard)
  async session(@GetUser() user: any) {
    return {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      message: 'Session is active',
    };
  }

  @Get('verify')
  @UseGuards(AuthGuard)
  async verify(@GetUser() user: any) {
    // AuthGuard already validated the token and attached user to request
    return {
      success: true,
      message: 'Token is valid',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    };
  }


  @Get('me')
  @UseGuards(AuthGuard)
  async getCurrentUser(@GetUser() user: any) {
    // Return complete user profile data (no sensitive data like password)
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      profilePic: user.profilePic,
      storeName: user.storeName,
      phone: user.phone,
      role: user.role,
      rating: user.rating || 0,
      totalRatings: user.totalRatings || 0,
      createdAt: user.createdAt,
    };
  }
}
