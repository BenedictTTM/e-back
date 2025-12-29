import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SearchService } from './search.service';
import { PrismaModule } from '../prisma/prisma.module';


@Global()
@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}
