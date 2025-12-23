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

@Injectable()
export class CrudService {
  private readonly logger = new Logger(CrudService.name);

  constructor(
    private prisma: PrismaService,
    private cloudinaryService: CloudinaryService,
  ) {}

  async uploadImageToCloudinary(file: Express.Multer.File) {
    return await this.cloudinaryService.uploadImage(file).catch(() => {
      throw new BadRequestException('Invalid file type.');
    });
  }

  async createProduct(productData: ProductDto,  files?: Express.Multer.File[]) {
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

    if (cartItemsCount > 0 || orderItemsCount > 0 || reviewsCount > 0 || imagesCount > 0 || deliveryCount > 0) {
      throw new BadRequestException('Cannot delete product with existing cart items, orders, reviews, images, or delivery info');
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
}
