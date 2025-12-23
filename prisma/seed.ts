import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Seeding database...');

    // 1. Seed Categories
    const categories = [
        { name: 'Electronics', description: 'Gadgets and devices' },
        { name: 'Fashion', description: 'Clothing and accessories' },
        { name: 'Home', description: 'Furniture and home decor' },
        { name: 'Beauty', description: 'Cosmetics and skincare' },
        { name: 'Sports', description: 'Sporting goods and equipment' },
        { name: 'Books', description: 'Books and literature' },
    ];

    for (const cat of categories) {
        await prisma.category.upsert({
            where: { name: cat.name },
            update: {},
            create: cat,
        });
    }

    console.log('Categories seeded.');

    // Fetch categories to get IDs
    const electronics = await prisma.category.findUnique({ where: { name: 'Electronics' } });
    const fashion = await prisma.category.findUnique({ where: { name: 'Fashion' } });
    const home = await prisma.category.findUnique({ where: { name: 'Home' } });
    const beauty = await prisma.category.findUnique({ where: { name: 'Beauty' } });

    // 2. Seed Products
    const products = [
        {
            title: 'Smartphone X',
            description: 'Latest model with high-resolution camera and fast processor.',
            imageUrl: ['https://images.unsplash.com/photo-1598327771866-54047641bc48?w=500&auto=format&fit=crop&q=60'],
            category: 'Electronics',
            categoryId: electronics?.id,
            originalPrice: 999.99,
            discountedPrice: 899.99,
            stock: 50,
            condition: 'New',
            tags: ['smartphone', 'tech', 'mobile'],
            isActive: true,
        },
        {
            title: 'Wireless Headphones',
            description: 'Noise-cancelling over-ear headphones with long battery life.',
            imageUrl: ['https://images.unsplash.com/photo-1546435770-a3e2feadf12e?w=500&auto=format&fit=crop&q=60'],
            category: 'Electronics',
            categoryId: electronics?.id,
            originalPrice: 199.99,
            discountedPrice: 149.99,
            stock: 100,
            condition: 'New',
            tags: ['audio', 'headphones', 'music'],
            isActive: true,
        },
        {
            title: 'Casual T-Shirt',
            description: 'Cotton t-shirt available in multiple colors.',
            imageUrl: ['https://images.unsplash.com/photo-1576566588028-4147f3842f27?w=500&auto=format&fit=crop&q=60'],
            category: 'Fashion',
            categoryId: fashion?.id,
            originalPrice: 29.99,
            discountedPrice: 19.99,
            stock: 200,
            condition: 'New',
            tags: ['clothing', 't-shirt', 'casual'],
            isActive: true,
        },
        {
            title: 'Denim Jacket',
            description: 'Classic denim jacket for all seasons.',
            imageUrl: ['https://images.unsplash.com/photo-1551488852-08016580c85c?w=500&auto=format&fit=crop&q=60'],
            category: 'Fashion',
            categoryId: fashion?.id,
            originalPrice: 79.99,
            discountedPrice: 59.99,
            stock: 80,
            condition: 'New',
            tags: ['clothing', 'jacket', 'denim'],
            isActive: true,
        },
        {
            title: 'Modern Sofa',
            description: 'Comfortable 3-seater sofa with modern design.',
            imageUrl: ['https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=500&auto=format&fit=crop&q=60'],
            category: 'Home',
            categoryId: home?.id,
            originalPrice: 1200.00,
            discountedPrice: 999.00,
            stock: 10,
            condition: 'New',
            tags: ['furniture', 'sofa', 'living room'],
            isActive: true,
        },
        {
            title: 'Skin Care Set',
            description: 'Complete set for daily skin care routine.',
            imageUrl: ['https://images.unsplash.com/photo-1596462502278-27bfdd403cc2?w=500&auto=format&fit=crop&q=60'],
            category: 'Beauty',
            categoryId: beauty?.id,
            originalPrice: 150.00,
            discountedPrice: 120.00,
            stock: 100,
            condition: 'New',
            tags: ['beauty', 'skincare', 'cosmetics'],
            isActive: true,
        },
    ];

    for (const product of products) {
        // Check if product exists by title to avoid duplicates if run multiple times
        const existing = await prisma.product.findFirst({
            where: { title: product.title }
        });

        if (!existing) {
            await prisma.product.create({
                data: product
            });
        }
    }

    console.log('Products seeded.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
