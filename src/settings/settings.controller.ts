import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { AdminGuard } from '../guards/admin.guard';

@Controller('settings')
export class SettingsController {
    constructor(private readonly settingsService: SettingsService) { }

    @Get()
    getSettings() {
        return this.settingsService.getSettings();
    }

    @Put()
    @UseGuards(AdminGuard)
    updateSettings(@Body() updateSettingsDto: UpdateSettingsDto) {
        return this.settingsService.updateSettings(updateSettingsDto);
    }
}
