import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { KeepAliveService } from './keepalive.service';

@Module({
  controllers: [HealthController],
  providers: [KeepAliveService],
})
export class HealthModule {}
