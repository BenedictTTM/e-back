import { Controller, Get, Body, Patch, Param, ParseIntPipe, Query } from '@nestjs/common';
import { UserService } from './user.service';
import { UserDto } from './dto/user.dto';
import { CloudinaryService } from '../cloudinary/cloudinary.service';

@Controller('users')
export class UserController {
    constructor(
        private readonly userService: UserService,
        private readonly cloudinaryService: CloudinaryService
    ) { }

    @Get()
    getAllUsers() {
        return this.userService.getAllUsers();
    }

    @Get('customers/paid')
    async getCustomersWithPaidOrders(
        @Query('startDate') startDate?: string,
        @Query('endDate') endDate?: string,
    ) {
        const filters: any = {};

        if (startDate) {
            filters.startDate = new Date(startDate);
        }

        if (endDate) {
            filters.endDate = new Date(endDate);
        }

        return this.userService.getCustomersWithPaidOrders(filters);
    }

    @Get(':id')
    getUserById(@Param('id', ParseIntPipe) id: number) {
        return this.userService.getUserById(id);
    }

    @Get(':id/profile')
    findOne(@Param('id', ParseIntPipe) id: number) {
        return this.userService.findOne(id);
    }

    @Patch(':id')
    updateUser(
        @Param('id', ParseIntPipe) id: number,
        @Body() updateUserDto: UserDto
    ) {
        return this.userService.update(id, updateUserDto);
    }
}