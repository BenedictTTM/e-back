import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { ProductService } from '../product.service';

async function bootstrap() {
    try {
        const app = await NestFactory.createApplicationContext(AppModule);
        const productService = app.get(ProductService);

        console.log('Starting product import...');
        // Assuming user ID 1 is an admin or the intended owner
        const userId = 1;
        const result = await productService.importProductsFromJSON(userId);

        console.log('Import completed successfully:');
        console.log(JSON.stringify(result, null, 2));

        await app.close();
        process.exit(0);
    } catch (error) {
        console.error('Import failed:', error);
        process.exit(1);
    }
}

bootstrap();
