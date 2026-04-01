import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';


@Injectable()
export class AdminGuard implements CanActivate {
  private readonly logger = new Logger(AdminGuard.name);
  private readonly ADMIN_ROLE = 'ADMIN';

  constructor(private readonly reflector: Reflector) { }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const { method, url, user } = request;

    this.logger.log(`Admin access attempt: ${method} ${url} by ${user?.email || 'unknown'}`);

    if (!user) {
      throw new UnauthorizedException('Authentication required. Please ensure you are logged in.');
    }

    if (!user.id || !user.email) {
      throw new UnauthorizedException('Invalid user session. Please re-authenticate.');
    }

    if (user.isDeleted) {
      throw new ForbiddenException('Account is deactivated. Contact support.');
    }

    if (!user.role) {
      throw new ForbiddenException('User role not configured. Contact system administrator.');
    }

    const isAdmin = user.role === this.ADMIN_ROLE;

    if (!isAdmin) {
      this.logger.warn(
        `Unauthorized: ${user.email} (Role: ${user.role}) -> ${method} ${url}`,
      );
      throw new ForbiddenException('Access denied. Administrator privileges required.');
    }

    this.logger.log(`Admin access granted: ${user.email} -> ${method} ${url}`);
    request.isAdmin = true;
    request.accessGrantedAt = new Date();

    return true;
  }
}
