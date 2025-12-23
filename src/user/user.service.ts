import { PrismaService } from "../prisma/prisma.service";
import { Role } from '@prisma/client';
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { UserDto } from "../user/dto/user.dto";

@Injectable()
export class UserService {
    constructor(private readonly prismaService: PrismaService) { }


    async getUserById(userId: number) {
        const user = await this.prismaService.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                createdAt: true,
                email: true,
                firstName: true,
                lastName: true,
                profilePic: true,
                role: true,
                rating: true,
                products: {
                    select: {
                        id: true,
                        title: true,
                        discountedPrice: true,
                        createdAt: true,
                        category: true,
                        isActive: true,
                        description: true,
                    }
                }
            }
        });

        return user;
    }


    async findOne(userId: number) {
        const user = await this.prismaService.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                createdAt: true,
                email: true,
                firstName: true,
                lastName: true,
                role: true,
                rating: true,
            }
        });

        if (!user) {
            throw new NotFoundException(`User with ID ${userId} not found`);
        }

        return user;
    }

    // ...existing code...
    async update(userId: number, updateUserDto: UserDto) {

        const updatedUser = await this.prismaService.user.update({
            where: { id: userId },
            data: {
                email: updateUserDto.email,
                firstName: updateUserDto.name,
                ...(updateUserDto.role && { role: { set: updateUserDto.role as Role } }),
            },
            select: {
                id: true,
                createdAt: true,
                email: true,
                firstName: true,
                lastName: true,
                role: true,
            }
        });

        return updatedUser;
    }

    async getAllUsers() {
        const users = await this.prismaService.user.findMany({
            select: {
                id: true,
                createdAt: true,
                email: true,
                firstName: true,
                lastName: true,
                storeName: true,
                profilePic: true,
                role: true,
                rating: true,
                totalRatings: true,
            }
        })
        return users;
    }

    /**
     * Get all customers who have paid for at least one order.
     * Supports optional date range filtering for "this session" or specific time periods.
     */
    async getCustomersWithPaidOrders(filters?: {
        startDate?: Date;
        endDate?: Date;
    }) {
        // Build where clause for date filtering
        const dateFilter: any = {};
        if (filters?.startDate || filters?.endDate) {
            dateFilter.createdAt = {};
            if (filters.startDate) {
                dateFilter.createdAt.gte = filters.startDate;
            }
            if (filters.endDate) {
                dateFilter.createdAt.lte = filters.endDate;
            }
        }

        // Get all users who have at least one order with paymentStatus = 'PAID'
        const customersWithPaidOrders = await this.prismaService.user.findMany({
            where: {
                isDeleted: false,
            },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                profilePic: true,
                username: true,
                createdAt: true,
            },
        });

        // For each user, get their paid orders and aggregate statistics
        const customersWithStats = await Promise.all(
            customersWithPaidOrders.map(async (user) => {
                const paidOrders = await (this.prismaService as any).order.findMany({
                    where: {
                        buyerId: user.id,
                        paymentStatus: 'PAID',
                        ...dateFilter,
                    },
                    select: {
                        id: true,
                        totalAmount: true,
                        createdAt: true,
                        updatedAt: true,
                    },
                    orderBy: {
                        createdAt: 'desc',
                    },
                });

                // Only include users who have at least one paid order
                if (paidOrders.length === 0) {
                    return null;
                }

                const totalOrders = paidOrders.length;
                const totalSpent = paidOrders.reduce((sum, order) => sum + order.totalAmount, 0);
                const lastOrderDate = paidOrders[0]?.createdAt;

                return {
                    id: user.id.toString(),
                    name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username || 'Unknown',
                    email: user.email,
                    avatarUrl: user.profilePic,
                    totalOrders,
                    totalSpent,
                    lastOrderDate: lastOrderDate ? lastOrderDate.toISOString().split('T')[0] : 'N/A',
                };
            })
        );

        // Filter out null entries (users without paid orders)
        return customersWithStats.filter(customer => customer !== null);
    }

}