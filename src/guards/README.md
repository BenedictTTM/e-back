# Authentication & Authorization Guards

## Overview

This directory contains NestJS guards for protecting routes with authentication and authorization layers.

## Guards

### 1. AuthGuard (`auth.guard.ts`)

**Purpose:** Validates JWT tokens and authenticates users.

**Responsibilities:**

- Extract JWT from cookies or Authorization header
- Verify token signature and expiration
- Fetch user from database
- Check if user account is active
- Attach user object to request

**Usage:**

```typescript
@UseGuards(AuthGuard)
@Get('/profile')
getProfile(@Request() req) {
  return req.user; // User object available
}
```

---

### 2. AdminGuard (`admin.guard.ts`)

**Purpose:** Restricts access to admin-only routes.

**Responsibilities:**

- Verify user is authenticated (relies on AuthGuard)
- Check user has ADMIN role
- Log access attempts for security monitoring
- Provide detailed error messages

**Usage:**

```typescript
// IMPORTANT: AuthGuard MUST come before AdminGuard
@UseGuards(AuthGuard, AdminGuard)
@Get('/admin/users')
getAllUsers() {
  return this.userService.findAll();
}
```

**With decorator:**

```typescript
import { Admin } from '../decorators/admin.decorator';

@Admin()
@UseGuards(AuthGuard, AdminGuard)
@Delete('/admin/users/:id')
deleteUser(@Param('id') id: string) {
  return this.userService.remove(id);
}
```

---

### 3. RolesGuard (`roles.guard.ts`)

**Purpose:** Flexible role-based access control for multiple roles.

**Responsibilities:**

- Check user has ANY of the required roles
- Works with @Roles() decorator
- Supports multiple role requirements

**Usage:**

```typescript
import { Roles } from '../decorators/roles.decorators';

@Roles('ADMIN', 'MODERATOR')
@UseGuards(AuthGuard, RolesGuard)
@Get('/moderation/reports')
getReports() {
  return this.moderationService.getReports();
}
```

---

### 4. RefreshTokenGuard (`refresh-token.guard.ts`)

**Purpose:** Validates refresh tokens for token renewal.

**Usage:**

```typescript
@UseGuards(RefreshTokenGuard)
@Post('/auth/refresh')
refreshTokens(@Request() req) {
  return this.authService.refreshTokens(req.user);
}
```

---

## Guard Execution Order

⚠️ **CRITICAL:** Always apply guards in the correct order:

```typescript
// ✅ CORRECT ORDER
@UseGuards(AuthGuard, AdminGuard)     // Auth first, then authorization
@UseGuards(AuthGuard, RolesGuard)     // Auth first, then roles

// ❌ WRONG ORDER
@UseGuards(AdminGuard, AuthGuard)     // Will fail - no user object yet
@UseGuards(RolesGuard, AuthGuard)     // Will fail - no user object yet
```

**Why?** Authorization guards (AdminGuard, RolesGuard) depend on the `user` object being attached to the request by AuthGuard.

---

## Comparison: AdminGuard vs RolesGuard

| Feature            | AdminGuard                      | RolesGuard                      |
| ------------------ | ------------------------------- | ------------------------------- |
| **Purpose**        | Admin-only access               | Multi-role access               |
| **Flexibility**    | Fixed to ADMIN role             | Accepts any roles via decorator |
| **Error Messages** | Highly specific                 | Generic role-based              |
| **Logging**        | Comprehensive security logs     | Basic logging                   |
| **Use Case**       | Super-admin features            | Flexible RBAC                   |
| **Performance**    | Slightly faster (no reflection) | Uses reflection API             |

### When to use AdminGuard:

- ✅ Routes that only admins should access
- ✅ When you want explicit, detailed security logging
- ✅ Critical admin operations (user deletion, system config)

### When to use RolesGuard:

- ✅ Routes accessible by multiple roles
- ✅ When roles might change frequently
- ✅ More flexible authorization requirements

---

## Global Guards (Optional)

For application-wide authentication:

```typescript
// main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Apply AuthGuard globally (all routes require authentication)
  // app.useGlobalGuards(new AuthGuard()); // Requires careful setup

  await app.listen(3000);
}
```

⚠️ **Warning:** Global guards require proper exception handling for public routes (login, signup).

---

## Security Best Practices

### ✅ DO:

1. Always apply `AuthGuard` before authorization guards
2. Use `AdminGuard` for sensitive admin operations
3. Log all admin access attempts
4. Validate user object integrity in guards
5. Use HTTPS in production
6. Implement rate limiting on admin routes
7. Monitor failed authorization attempts

### ❌ DON'T:

1. Apply authorization guards without authentication
2. Trust client-side role information
3. Skip role validation for "internal" routes
4. Expose detailed error messages in production
5. Use the same guard for authentication and authorization
6. Hardcode admin user IDs

---

## Testing Guards

```typescript
// admin.guard.spec.ts
describe('AdminGuard', () => {
  let guard: AdminGuard;

  it('should allow admin users', async () => {
    const context = createMockContext({ role: 'ADMIN' });
    expect(await guard.canActivate(context)).toBe(true);
  });

  it('should deny non-admin users', async () => {
    const context = createMockContext({ role: 'USER' });
    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });
});
```

---

## Troubleshooting

### Issue: "User not authenticated" despite valid token

**Solution:** Ensure `AuthGuard` is applied before `AdminGuard`

### Issue: "User role not configured"

**Solution:** Check that user object from DB includes `role` field

### Issue: Admin guard passes but shouldn't

**Solution:** Verify role enum values match exactly (case-sensitive)

---

## Migration from RolesGuard to AdminGuard

If currently using `RolesGuard` for admin routes:

```typescript
// Before
@Roles('ADMIN')
@UseGuards(AuthGuard, RolesGuard)

// After (more secure and explicit)
@Admin()
@UseGuards(AuthGuard, AdminGuard)
```

Benefits:

- More explicit security logging
- Better error messages
- Dedicated admin-specific validation
- Clearer code intent

---

## Related Files

- `../decorators/roles.decorators.ts` - @Roles() decorator
- `../decorators/admin.decorator.ts` - @Admin() decorator
- `../auth/auth.guard.ts` - Authentication guard
- `../auth/services/token.service.ts` - Token management

---

## Questions?

For security concerns or guard-related questions, contact the backend security team.
