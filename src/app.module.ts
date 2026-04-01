import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProductModule } from './product/product.module'
import { CloudinaryModule } from './cloudinary/cloudinary.module';
import { CartModule } from './cart/cart.module';
import { SearchModule } from './search/search.module';
import { PaymentModule } from './payment/payment.module';
import { OrderModule } from './order/order.module';
import { CategoryModule } from './category/category.module';
import { FeedbackModule } from './feedback/feedback.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // Makes ConfigModule available globally
    }),
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 100,
    }]),
    ScheduleModule.forRoot(), // Enable cron jobs
    AuthModule,
    UserModule,
    PrismaModule,
    HealthModule, // Health check + keepalive (prevents cold starts)
    ProductModule,
    CloudinaryModule,
    CartModule,
    SearchModule, // PostgreSQL Full-Text Search
    PaymentModule,
    CategoryModule,
    OrderModule,
    FeedbackModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule { }
