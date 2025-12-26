
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function main() {
    const productsPath = path.join(__dirname, 'products.json');
    const productsData = JSON.parse(fs.readFileSync(productsPath, 'utf-8'));

    console.log(`Loading ${productsData.length} products to import...`);

    // Default user to assign products to (first user found)
    const user = await prisma.user.findFirst();

    if (!user) {
        console.error('No user found in the database. Please create a user first.');
        return;
    }

    console.log(`Using user ID: ${user.id} (${user.email}) as the product owner.`);

    for (const item of productsData) {
        // 1. Ensure Category Exists
        let category = await prisma.category.findUnique({
            where: { name: item.category_name },
        });

        if (!category) {
            console.log(`Creating category: ${item.category_name}`);
            category = await prisma.category.create({
                data: {
                    name: item.category_name,
                    description: `Products in ${item.category_name}`,
                },
            });
        }

        // 2. Prepare Product Data
        const imageUrls = item.images.map((img: any) => img.url);
        // Construct tags from title - simple logic: split by space, take first 3, clean them
        const tags = item.title.split(' ')
            .map((w: string) => w.replace(/[^\w\s]/gi, '').toLowerCase()) // Remove special chars
            .filter((w: string) => w.length > 2)
            .slice(0, 3);

        // Ensure at least 2 tags as per frontend requirements if possible, else duplicates
        if (tags.length < 2) {
            tags.push('general');
            if (tags.length < 2) tags.push('product');
        }

        // 3. Create Product
        console.log(`Importing product: ${item.title}`);
        try {
            const product = await prisma.product.create({
                data: {
                    title: item.title,
                    description: item.details,
                    originalPrice: parseFloat(item.price_obj.value),
                    discountedPrice: parseFloat(item.price_obj.value), // Assuming no discount initially
                    stock: item.stock || 10,
                    condition: 'new', // Default condition
                    category: item.category_name,
                    categoryId: category.id,
                    tags: tags,
                    imageUrl: imageUrls,
                    userId: user.id,
                    isActive: true,
                    images: {
                        create: imageUrls.map((url: string) => ({
                            url: url,
                        })),
                    },
                },
            });
            console.log(`  -> Created product ID: ${product.id}`);
        } catch (error) {
            console.error(`  -> Failed to create product ${item.title}:`, error);
        }
    }

    console.log('Import completed!');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
