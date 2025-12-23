import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
    constructor() {
        super({
            datasources: {
                db: {
                    url: process.env.DATABASE_URL || 'file:./dev.db',
                },
            },
        });
    }

    async onModuleInit() {
        try {
            await this.$connect();
            console.log('Prisma: connected to database');
        } catch (error) {
            console.error('Prisma connection error:', error);
        }
    }
}
