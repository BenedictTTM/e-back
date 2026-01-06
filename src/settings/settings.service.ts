
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

@Injectable()
export class SettingsService {
    constructor(private prisma: PrismaService) { }

    async getSettings() {
        let settings = await this.prisma.topBarSettings.findUnique({
            where: { id: 1 },
        });

        if (!settings) {
            settings = await this.prisma.topBarSettings.create({
                data: {
                    topic: 'Welcome to Nakpin',
                    callNumber: '+233 00 000 0000',
                    discountPercentage: '0%',
                    isActive: true,
                },
            });
        }

        return settings;
    }

    async updateSettings(updateSettingsDto: UpdateSettingsDto) {
        // Ensure the settings record exists before updating
        await this.getSettings();

        return this.prisma.topBarSettings.update({
            where: { id: 1 },
            data: updateSettingsDto,
        });
    }
}
