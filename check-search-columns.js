const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('Connecting to database...');

    try {
        // Check if columns exist and have data
        const products = await prisma.$queryRaw`
      SELECT id, title, "searchText", "searchVector"::text 
      FROM "Product" 
      ORDER BY id DESC
      LIMIT 5
    `;

        console.log('Found products:', products.length);

        if (products.length > 0) {
            products.forEach(p => {
                console.log(`\nProduct ID: ${p.id}`);
                console.log(`Title: ${p.title}`);
                console.log(`searchText: ${p.searchText ? p.searchText.substring(0, 50) + '...' : 'NULL'}`);
                console.log(`searchVector: ${p.searchVector ? 'Present (tsvector)' : 'NULL'}`);
            });
        } else {
            console.log('No products found in database.');
        }

    } catch (error) {
        console.error('Error querying database:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
