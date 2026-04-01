import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(
    private jwtService: JwtService,
    private prismaService: PrismaService,
    private configService: ConfigService,
  ) { }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromRequest(request);

    if (!token) {
      throw new UnauthorizedException('Access token is required');
    }

    try {
      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });

      const userId = payload.sub || payload.id;
      if (!userId) {
        throw new UnauthorizedException('Invalid token payload');
      }

      const user = await this.prismaService.user.findUnique({
        where: { id: userId },
        select: {
          id: true, email: true, role: true, isDeleted: true,
          firstName: true, lastName: true, createdAt: true,
        },
      });

      if (!user) throw new UnauthorizedException('User not found');
      if (user.isDeleted) throw new UnauthorizedException('User account deactivated');

      request.user = { ...payload, ...user };
      return true;
    } catch (error) {
      if (error.name === 'TokenExpiredError') throw new UnauthorizedException('Token has expired');
      if (error.name === 'JsonWebTokenError') throw new UnauthorizedException('Invalid token format');
      if (error.name === 'NotBeforeError') throw new UnauthorizedException('Token not active');
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private extractTokenFromRequest(request: any): string | undefined {
    const authHeader = request.headers.authorization;
    if (authHeader) {
      const [type, token] = authHeader.split(' ');
      if (type === 'Bearer' && token) return token;
    }
    return undefined;
  }
}
