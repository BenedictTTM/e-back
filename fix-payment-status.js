/**
 * Script to fix payment status for orders with successful payments
 * Run this once to sync existing data
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function fixPaymentStatuses() {
    console.log('🔍 Finding orders with successful payments...');

    try {
        // Find all payments that are successful and linked to orders
        const successfulPayments = await prisma.payment.findMany({
            where: {
                orderId: { not: null },
                status: { in: ['success', 'successful', 'completed'] },
            },
            include: {
                order: true,
            },
        });

        console.log(`✅ Found ${successfulPayments.length} successful payments linked to orders`);

        let updated = 0;
        for (const payment of successfulPayments) {
            if (!payment.order) continue;

            // Check if order payment status needs updating
            if (payment.order.paymentStatus !== 'PAID') {
                console.log(`📝 Updating Order #${payment.orderId}: UNPAID → PAID`);

                await prisma.order.update({
                    where: { id: payment.orderId },
                    data: { paymentStatus: 'PAID' },
                });

                updated++;
            } else {
                console.log(`✓ Order #${payment.orderId} already marked as PAID`);
            }
        }

        console.log(`\n✅ Fixed ${updated} order payment statuses`);
        console.log(`✓ ${successfulPayments.length - updated} orders were already correct`);

    } catch (error) {
        console.error('❌ Error fixing payment statuses:', error);
    } finally {
        await prisma.$disconnect();
    }
}

fixPaymentStatuses();
