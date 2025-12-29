import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  InternalServerErrorException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ProductDto } from '../dto/product.dto';
import { CloudinaryService } from 'src/cloudinary/cloudinary.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class CrudService {
  private readonly logger = new Logger(CrudService.name);

  constructor(
    private prisma: PrismaService,
    private cloudinaryService: CloudinaryService,
  ) { }

  async uploadImageToCloudinary(file: Express.Multer.File) {
    return await this.cloudinaryService.uploadImage(file).catch(() => {
      throw new BadRequestException('Invalid file type.');
    });
  }

  async createProduct(productData: ProductDto, files?: Express.Multer.File[]) {
    const startTime = Date.now();

    try {
      const { userId, ...productDataWithoutUser } = productData;

      let imageUrls: string[] = [];

      // OPTIMIZATION: Parallel image uploads (3x faster)
      if (files && files.length > 0) {
        this.logger.log(`⏫ Uploading ${files.length} images in parallel...`);
        const uploadStart = Date.now();

        const uploadResults = await Promise.all(
          files.map(file => this.uploadImageToCloudinary(file))
        );
        imageUrls = uploadResults.map(result => result.secure_url);

        const uploadDuration = Date.now() - uploadStart;
        this.logger.log(`✅ Images uploaded | ${files.length} files | ${uploadDuration}ms`);
      }

      // OPTIMIZATION: Fast transaction with minimal scope
      const newProduct = await this.prisma.$transaction(async (prisma) => {
        let categoryName = productDataWithoutUser.category;

        // If categoryId is provided, validate it and get the name
        if (productDataWithoutUser.categoryId) {
          const category = await prisma.category.findUnique({
            where: { id: productDataWithoutUser.categoryId },
          });

          if (!category) {
            throw new BadRequestException(`Category with ID ${productDataWithoutUser.categoryId} not found`);
          }

          // Use category name if category string is not provided
          if (!categoryName) {
            categoryName = category.name;
          }
        } else if (!categoryName) {
          throw new BadRequestException('Either category (string) or categoryId must be provided');
        }

        // Create product (note: slot management removed from schema)
        const created = await prisma.product.create({
          data: {
            title: productDataWithoutUser.title,
            description: productDataWithoutUser.description,
            originalPrice: productDataWithoutUser.originalPrice,
            discountedPrice: productDataWithoutUser.discountedPrice,
            category: categoryName,
            categoryId: productDataWithoutUser.categoryId,
            imageUrl: imageUrls,
            isActive: true,
            isSold: false,
            condition: (productDataWithoutUser as any).condition ?? '',
            tags: productDataWithoutUser.tags ?? [],
            stock: productDataWithoutUser.stock ?? 0,
            views: productDataWithoutUser.views ?? 0,
            userId: userId,
          },
        });

        return created;
      });

      const duration = Date.now() - startTime;
      this.logger.log(`✅ Product created | ID:${newProduct.id} | ${duration}ms`);

      return { success: true, data: newProduct };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`❌ Product creation failed | ${duration}ms | ${error.message}`);
      throw new InternalServerErrorException(`Failed to create product: ${error.message}`);
    }
  }

  /**
   * Update product with optimized ownership check
   */
  async updateProduct(productId: number, productData: Partial<ProductDto>, userId: number) {
    const startTime = Date.now();

    // OPTIMIZATION: Fetch only necessary fields for ownership check
    const product = await (this.prisma as any).product.findUnique({
      where: { id: productId },
      select: { id: true, userId: true },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${productId} not found`);
    }

    if (product.userId !== userId) {
      throw new ForbiddenException('You can only update your own products');
    }


    try {
      const updated = await (this.prisma as any).product.update({
        where: { id: productId },
        data: productData,
      });

      const duration = Date.now() - startTime;
      this.logger.log(`✅ Product updated | ID:${productId} | ${duration}ms`);

      return { success: true, data: updated };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`❌ Update failed | ID:${productId} | ${duration}ms`);
      throw new InternalServerErrorException(`Failed to update product: ${error.message}`);
    }
  }

  /**
   * Hard delete product
   */
  async deleteProduct(productId: number, userId: number) {
    const startTime = Date.now();

    const product = await (this.prisma as any).product.findUnique({
      where: { id: productId },
      select: { id: true, userId: true },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${productId} not found`);
    }

    // Check for related records that prevent deletion
    const cartItemsCount = await (this.prisma as any).cartItem.count({
      where: { productId },
    });
    const orderItemsCount = await (this.prisma as any).orderItem.count({
      where: { productId },
    });
    const reviewsCount = await (this.prisma as any).review.count({
      where: { productId },
    });
    const imagesCount = await (this.prisma as any).productImage.count({
      where: { productId },
    });
    const deliveryCount = await (this.prisma as any).delivery.count({
      where: { productId },
    });

    if (cartItemsCount > 0 || orderItemsCount > 0 || reviewsCount > 0 || deliveryCount > 0) {
      // Fallback to Soft Delete (Archive)
      this.logger.log(`⚠️ Dependencies found, performing soft delete for product ${productId}`);

      const archived = await (this.prisma as any).product.update({
        where: { id: productId },
        data: {
          isActive: false,
          isSold: true // Mark as sold helps remove it from view too
        },
      });

      return {
        success: true,
        data: archived,
        message: 'Product archived (dependencies exist)'
      };
    }


    try {
      const deleted = await (this.prisma as any).product.delete({
        where: { id: productId },
      });

      const duration = Date.now() - startTime;
      this.logger.log(`✅ Product deleted | ID:${productId} | ${duration}ms`);

      return { success: true, data: deleted };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`❌ Delete failed | ID:${productId} | ${duration}ms | ${error.message}`);
      throw new InternalServerErrorException(`Failed to delete product: ${error.message}`);
    }
  }

  /**
   * Import products from JSON file
   */
  async importProductsFromJSON(userId: number) {
    const startTime = Date.now();
    const filePath = path.join(process.cwd(), 'src/product/data/products.json');

    try {
      if (!fs.existsSync(filePath)) {
        throw new NotFoundException('Products JSON file not found');
      }

      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const jsonData = JSON.parse(fileContent);
      const adverts = jsonData.adverts_list?.adverts || [];

      this.logger.log(`Found ${adverts.length} products to import`);

      let importedCount = 0;
      let skippedCount = 0;

      for (const advert of adverts) {
        // Check if product exists by title
        const existingProduct = await this.prisma.product.findFirst({
          where: { title: advert.title },
        });

        if (existingProduct) {
          this.logger.log(`Skipping duplicate product: ${advert.title}`);
          skippedCount++;
          continue;
        }

        // Map JSON data to ProductDto structure
        // Note: category logic might need adjustment if categories don't exist
        // For now, we use the string category name as per createProduct logic

        // Extract image URLs
        const imageUrls = advert.images?.map((img: any) => img.url) || [];

        await this.prisma.product.create({
          data: {
            title: advert.title,
            description: advert.details || advert.short_description || '',
            originalPrice: parseFloat(advert.price_obj?.value || 0),
            discountedPrice: parseFloat(advert.price_obj?.value || 0), // Assuming no discount initially
            category: advert.category_name || 'Uncategorized',
            imageUrl: imageUrls,
            isActive: true,
            isSold: false,
            condition: 'New', // Defaulting to New
            tags: [], // Could extract from title or description if needed
            stock: 10, // Default stock
            views: 0,
            userId: userId,
          },
        });
        importedCount++;
      }

      const duration = Date.now() - startTime;
      this.logger.log(`✅ Import completed | Imported: ${importedCount} | Skipped: ${skippedCount} | ${duration}ms`);

      return {
        success: true,
        message: `Import completed. Imported: ${importedCount}, Skipped: ${skippedCount}`,
        importedCount,
        skippedCount,
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`❌ Import failed | ${duration}ms | ${error.message}`);
      throw new InternalServerErrorException(`Failed to import products: ${error.message}`);
    }
  }
}
