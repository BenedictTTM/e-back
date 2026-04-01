import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { PasswordResetController } from './passwordReset.controller';
import { OAuthController } from './controllers/oauth.controller';
import { AuthService } from './auth.service';
import { LoginService } from './services/login.service';
import { SignupService } from './services/signup.service';
import { TokenService } from './services/token.service';
import { UserValidationService } from './services/user-validation.service';
import { RefreshTokenService } from './services/refresh-token.service';
import { LogoutService } from './services/logout.service';
import { OAuthService } from './services/oauth.service';
import { PrismaModule } from '../prisma/prisma.module';
import { PasswordResetService } from './services/passwordReset.service';
import { EmailModule } from '../email/email.module';
import { GoogleStrategy } from './strategies/google.strategy';


@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    EmailModule,
    PassportModule.register({
      defaultStrategy: 'jwt',
      session: false, // Stateless authentication
    }),
    JwtModule.registerAsync({
      global: true,
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_EXPIRES_IN', '45m'),
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [
    AuthController,
    PasswordResetController,
    OAuthController,
  ],
  providers: [
    // Core Services
    AuthService,
    LoginService,
    SignupService,
    TokenService,
    UserValidationService,
    RefreshTokenService,
    LogoutService,
    PasswordResetService,

    // OAuth Services
    OAuthService,

    // Passport Strategies
    GoogleStrategy,
  ],
  exports: [
    AuthService,
    TokenService,
    UserValidationService,
    PasswordResetService,
    OAuthService,
  ],
})
export class AuthModule { }