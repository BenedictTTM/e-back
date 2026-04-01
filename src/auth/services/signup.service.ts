import { Injectable, ConflictException, InternalServerErrorException, Logger } from "@nestjs/common";
import { Response } from 'express';
import { PrismaService } from "../../prisma/prisma.service";
import { SignUpDto } from "../dto/signUp.dto";
import { JwtService } from '@nestjs/jwt';
import { TokenService } from './token.service';
import * as argon from 'argon2';

@Injectable()
export class SignupService {
  private readonly logger = new Logger(SignupService.name);

  constructor(private prismaService: PrismaService,
    private jwtService: JwtService,
    private readonly tokenService: TokenService
  ) { }

  async signup(dto: SignUpDto) {
    try {
      this.logger.log(`Creating user: ${dto.email}`);

      const existingUser = await this.prismaService.user.findUnique({
        where: { email: dto.email },
      });

      if (existingUser) {
        throw new ConflictException('User with this email already exists');
      }

      const passwordHash = await argon.hash(dto.password);

      const user = await this.prismaService.user.create({
        data: {
          email: dto.email,
          passwordHash,
          username: dto.email,
          firstName: dto.firstName,
          lastName: dto.lastName,
          role: 'USER',
        },
        select: {
          id: true,
          createdAt: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
        }
      });

      this.logger.log(`User created: ${user.id}`);

      const tokens = await this.tokenService.generateTokens(user.id, user.email, user.role);
      await this.tokenService.storeRefreshToken(user.id, tokens.refresh_token);

      return {
        success: true,
        message: 'Account created successfully',
        user,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
      };

    } catch (error) {
      return this.handleSignupError(error, dto.email);
    }
  }

  private handleSignupError(error: any, email: string) {
    this.logger.error(`Signup error: ${error.message}`, error.stack);

    if (error.code === 'P2002') {
      const field = error.meta?.target?.[0] || 'field';
      throw new ConflictException(`${field} already exists`);
    }

    if (error.code === 'P2000') {
      throw new ConflictException('Input data is too long');
    }

    if (error.code === 'P2001') {
      throw new ConflictException('Required data not found');
    }

    if (error instanceof ConflictException) {
      throw error;
    }

    if (error.message?.includes('argon2')) {
      throw new InternalServerErrorException('Failed to process password');
    }

    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      throw new InternalServerErrorException('Database temporarily unavailable');
    }

    throw new InternalServerErrorException('An unexpected error occurred during registration');
  }
}