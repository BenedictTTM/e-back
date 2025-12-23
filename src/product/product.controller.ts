import { Controller, Get, Post, Put, Delete, Body, Param, Query, ParseIntPipe , Request , UseGuards, ParseFloatPipe, DefaultValuePipe } from '@nestjs/common';
import { ProductService } from './product.service';
import { ProductDto } from './dto/product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { AuthGuard } from '../guards/auth.guard';
import { AdminGuard } from '../guards/admin.guard';
import { Admin } from '../decorators/admin.decorator';
import { FilesInterceptor } from '@nestjs/platform-express';
import { UseInterceptors } from '@nestjs/common';
import { UploadedFiles, ParseFilePipe, MaxFileSizeValidator, FileTypeValidator } from '@nestjs/common';
import { SearchProductsService } from './Service/search.products.service';
import { FlashSalesService } from './Service/flashsales.service';


@Controller('products')
export class ProductController {
  constructor(
    private readonly productService: ProductService,
    private readonly searchProductsService: SearchProductsService,
    private readonly flashSalesService: FlashSalesService,
  ) {}

@Post()
  @Admin() // Only admins can create products
  @UseGuards(AuthGuard, AdminGuard)
  @UseInterceptors(FilesInterceptor('images')) // Add this to handle file upload
  async createProduct(
    @Body() productData: ProductDto, 
    @Request() req,
    @UploadedFiles(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }), // 5MB
          new FileTypeValidator({ fileType: /(jpg|jpeg|png|gif)$/ }),
        ],
        fileIsRequired: false, // Make file optional
      })
    ) files?: Express.Multer.File[] // Add this parameter to receive the uploaded file
  ) {
    const userId = req.user?.id;
    console.log('User ID from token:', userId);
console.log('Uploaded files:', files && files.length > 0 ? files.map(f => f.originalname) : 'No files uploaded');
    
    return this.productService.createProduct(productData, files);
  }

  @Get()
  async getAllProducts(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number = 20,
  ) {
    return await this.productService.getAllProducts(page, limit);
  }

  @Get('search')
  async searchProducts(
    @Query('q') query: string = '',
    @Query('category') category?: string,
    @Query('minPrice', new DefaultValuePipe(undefined)) minPrice?: number,
    @Query('maxPrice', new DefaultValuePipe(undefined)) maxPrice?: number,
    @Query('condition') condition?: string,
    @Query('tags') tags?: string,
    @Query('inStock') inStock?: string,
    @Query('sortBy', new DefaultValuePipe('relevance')) sortBy?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number = 20,
    @Query('cacheable', new DefaultValuePipe('true')) cacheable?: string,
  ) {
    const filters: any = {};
    
    if (category) filters.category = category;
    if (minPrice !== undefined) filters.minPrice = Number(minPrice);
    if (maxPrice !== undefined) filters.maxPrice = Number(maxPrice);
    if (condition) filters.condition = condition;
    if (tags) filters.tags = tags.split(',').map(t => t.trim());
    if (inStock === 'true') filters.inStock = true;

    const options = {
      page,
      limit: Math.min(limit, 100), // Max 100 per page
      sortBy: sortBy as any,
      cacheable: cacheable !== 'false', // Allow cache bypass
    };

    // Use enterprise-grade search service
    return await this.searchProductsService.searchProducts(query, filters, options);
  }


  @Get('search/autocomplete')
  async getAutocompleteSuggestions(
    @Query('q') query: string,
    @Query('limit', new DefaultValuePipe(5), ParseIntPipe) limit: number = 5,
  ) {
    if (!query || query.trim().length < 2) {
      return { suggestions: [] };
    }
    
    // Use search service with caching
    const suggestions = await this.searchProductsService.getAutocompleteSuggestions(
      query,
      Math.min(limit, 10), // Max 10 suggestions
    );
    
    return { suggestions };
  }


  @Get('search/trending')
  async getTrendingSearches(
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number = 10,
  ) {
    // Use search service with caching
    const trending = await this.searchProductsService.getTrendingSearches(
      Math.min(limit, 20), // Max 20 trending items
    );
    
    return { trending };
  }

  @Get('category/:category')
  async getProductsByCategory(
    @Param('category') category: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number = 20,
  ) {
    return await this.productService.getProductsByCategory(category, page, limit);
  }

  @Get('user/me')
  @UseGuards(AuthGuard)
  async getMyProducts(
    @Request() req,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number = 20,
  ) {
    const userId = req.user?.id || req.user?.sub;
    
    if (!userId) {
      throw new Error('User ID not found in request');
    }

    console.log(`📦 Fetching products for user ID: ${userId}`);
    return await this.productService.getProductsByUserId(userId, page, limit);
  }

  @Get('user/:userId')
  async getProductsByUserId(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number = 20,
  ) {
    return await this.productService.getProductsByUserId(userId, page, limit);
  }


  @Get('flash-sales')
  async getFlashSales() {
    return await this.flashSalesService.getFlashSales();
  }

  @Get(':id')
  async getProductById(@Param('id', ParseIntPipe) productId: number) {
    return await this.productService.getProductById(productId);
  }


  @Put(':id')
  @UseGuards(AuthGuard)
  async updateProduct(
    @Param('id') id: string, 
    @Body() productData: UpdateProductDto, 
    @Request() req
  ) {
    const userId = req.user?.id;
    return this.productService.updateProduct(+id, productData, userId);
  }

  @Delete(':id')
  @UseGuards(AuthGuard)
  async deleteProduct(@Param('id') id: string, @Request() req) {
    const userId = req.user?.id;
    return this.productService.deleteProduct(+id, userId);
  }


  @Post('flash-sales/refresh')
  async refreshFlashSales() {
    return await this.flashSalesService.forceRefresh();
  }
}