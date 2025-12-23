import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class GoogleOAuthGuard extends AuthGuard('google') {

  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    if (err || !user) {
      // Log OAuth error for monitoring
      console.error('OAuth Error:', err || info);
      
      // Redirect to frontend with error
      const response = context.switchToHttp().getResponse();
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      
      return response.redirect(
        `${frontendUrl}/auth/error?message=${encodeURIComponent(
          err?.message || 'OAuth authentication failed'
        )}`
      );
    }

    return user;
  }
}
