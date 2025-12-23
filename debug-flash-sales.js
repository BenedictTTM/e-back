const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('🔍 Diagnosing Flash Sale Products...');

    try {
        const total = await prisma.product.count();
        console.log(`Total products: ${total}`);

        const active = await prisma.product.count({ where: { isActive: true } });
        console.log(`Active products: ${active}`);

        const notSold = await prisma.product.count({ where: { isSold: false } });
        console.log(`Not sold products: ${notSold}`);

        const inStock = await prisma.product.count({ where: { stock: { gt: 0 } } });
        console.log(`In stock (>0): ${inStock}`);

        const hasPrices = await prisma.product.count({
            where: {
                originalPrice: { gt: 0 },
                discountedPrice: { gt: 0 }
            }
        });
        console.log(`Has valid prices: ${hasPrices}`);

        const candidates = await prisma.product.findMany({
            where: {
                isActive: true,
                isSold: false,
                stock: { gt: 0 },
                originalPrice: { gt: 0 },
                discountedPrice: { gt: 0 },
            },
            select: { id: true, title: true, originalPrice: true, discountedPrice: true, user: true }
        });

        console.log(`\n✅ Products matching ALL criteria: ${candidates.length}`);

        if (candidates.length === 0) {
            console.log('\n❌ No products match all criteria. Checking for near-matches...');
            // Just list first 5 products and their status
            const sample = await prisma.product.findMany({ take: 5 });
            console.log('\nSample products status:');
            sample.forEach(p => {
                console.log(`ID ${p.id}: Active=${p.isActive}, Sold=${p.isSold}, Stock=${p.stock}, Orig=${p.originalPrice}, Disc=${p.discountedPrice}`);
            });
        } else {
            console.log('Sample matches:', candidates.slice(0, 3));

            // Check for user relation
            const withUser = candidates.filter(c => c.user);
            console.log(`\nCandidates with User relation: ${withUser.length} / ${candidates.length}`);
            if (withUser.length === 0) {
                console.log('⚠️ CRITICAL: Products found but "user" relation is null. FlashSalesService requires a user.');
            }
        }
    } catch (error) {
        console.error('Error running diagnosis:', error);
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
