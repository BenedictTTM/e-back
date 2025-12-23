import { SetMetadata } from '@nestjs/common';

/**
 * Admin Decorator
 * 
 * A semantic decorator for marking admin-only routes.
 * While not required by AdminGuard, it provides better code documentation
 * and can be used for reflection-based authorization if needed.
 * 
 * Usage:
 * @Admin()
 * @UseGuards(AuthGuard, AdminGuard)
 * @Get('/admin/sensitive-data')
 * getSensitiveData() { ... }
 * 
 * Benefits:
 * - Self-documenting code: Developers immediately see admin requirement
 * - Consistent with @Roles() pattern in your codebase
 * - Enables future reflection-based authorization patterns
 * - Can be scanned by static analysis tools for security audits
 */
export const ADMIN_KEY = 'isAdmin';
export const Admin = () => SetMetadata(ADMIN_KEY, true);
