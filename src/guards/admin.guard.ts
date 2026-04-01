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
  
  // Centralized constant for admin role - single source of truth
  private readonly ADMIN_ROLE = 'ADMIN';

  constructor(private readonly reflector: Reflector) {}


  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const { method, url, user } = request;

    // Log access attempt for security monitoring
    this.logger.log(
      `🔐 Admin access attempt: ${method} ${url} by user: ${user?.email || 'unknown'}`,
    );

    if (!user) {
      this.logger.error(
        `🚨 SECURITY: Unauthenticated request reached AdminGuard for ${method} ${url}. ` +
        `Ensure AuthGuard is applied before AdminGuard.`,
      );
      throw new UnauthorizedException(
        'Authentication required. Please ensure you are logged in.',
      );
    }

    // Defense Layer 2: Validate user object integrity
    if (!user.id || !user.email) {
      this.logger.error(
        `🚨 SECURITY: Malformed user object detected. User ID: ${user.id}, Email: ${user.email}`,
      );
      throw new UnauthorizedException('Invalid user session. Please re-authenticate.');
    }

    // Defense Layer 3: Check for deleted/deactivated accounts
    if (user.isDeleted) {
      this.logger.warn(
        `⚠️ Deactivated user attempted admin access: ${user.email} (ID: ${user.id})`,
      );
      throw new ForbiddenException('Account is deactivated. Contact support.');
    }

    // Defense Layer 4: Validate role property exists
    if (!user.role) {
      this.logger.error(
        `🚨 SECURITY: User missing role property. User: ${user.email} (ID: ${user.id})`,
      );
      throw new ForbiddenException(
        'User role not configured. Contact system administrator.',
      );
    }

    // Defense Layer 5: Check admin role
    const isAdmin = user.role === this.ADMIN_ROLE;

    if (!isAdmin) {
      // Log unauthorized access attempt for security audit
      this.logger.warn(
        `🚫 UNAUTHORIZED ACCESS ATTEMPT: User ${user.email} (ID: ${user.id}, Role: ${user.role}) ` +
        `attempted to access admin route: ${method} ${url}`,
      );

      throw new ForbiddenException(
        'Access denied. This resource requires administrator privileges.',
      );
    }

    // Success - log for compliance and monitoring
    this.logger.log(
      `✅ Admin access granted: ${user.email} (ID: ${user.id}) -> ${method} ${url}`,
    );

    // Attach additional metadata for downstream handlers (optional but useful)
    request.isAdmin = true;
    request.accessGrantedAt = new Date();

    return true;
  }
}
