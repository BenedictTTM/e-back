import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  Logger,
  ValidationPipe,
  UsePipes
} from '@nestjs/common';
import { CategoryService } from './category.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { AuthGuard } from '../guards/auth.guard';
import { AdminGuard } from '../guards/admin.guard';
import { Admin } from '../decorators/admin.decorator';

/**
 * Category Controller
 * Handles all category-related HTTP requests
 * 
 * Routes:
 * - GET    /categories      - Get all categories (public)
 * - GET    /categories/:id  - Get single category (public)
 * - POST   /categories      - Create category (admin only)
 * - PATCH  /categories/:id  - Update category (admin only)
 * - DELETE /categories/:id  - Delete category (admin only)
 */
@Controller('categories')
@UsePipes(new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true
}))
export class CategoryController {
  private readonly logger = new Logger(CategoryController.name);

  constructor(private readonly categoryService: CategoryService) { }

  /**
   * Create a new category (Admin only)
   * @param createCategoryDto - Category creation data
   * @returns Created category with HTTP 201
   */
  @Post()
  @UseGuards(AuthGuard, AdminGuard)
  @Admin()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createCategoryDto: CreateCategoryDto) {
    this.logger.log(`POST /categories - Creating category: ${createCategoryDto.name}`);
    const category = await this.categoryService.create(createCategoryDto);

    return {
      success: true,
      message: 'Category created successfully',
      data: category,
    };
  }

  /**
   * Get all categories with product counts (Public)
   * @returns Array of all categories
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  async findAll() {
    this.logger.log('GET /categories - Fetching all categories');
    const categories = await this.categoryService.findAll();

    return {
      success: true,
      message: 'Categories retrieved successfully',
      data: categories,
      count: categories.length,
    };
  }

  /**
   * Get a single category by ID (Public)
   * @param id - Category ID
   * @returns Category with products preview
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async findOne(@Param('id', ParseIntPipe) id: number) {
    this.logger.log(`GET /categories/${id} - Fetching category`);
    const category = await this.categoryService.findOne(id);

    return {
      success: true,
      message: 'Category retrieved successfully',
      data: category,
    };
  }

  /**
   * Update an existing category (Admin only)
   * @param id - Category ID
   * @param updateCategoryDto - Updated category data
   * @returns Updated category
   */
  @Patch(':id')
  @UseGuards(AuthGuard, AdminGuard)
  @Admin()
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateCategoryDto: UpdateCategoryDto
  ) {
    this.logger.log(`PATCH /categories/${id} - Updating category`);
    const category = await this.categoryService.update(id, updateCategoryDto);

    return {
      success: true,
      message: 'Category updated successfully',
      data: category,
    };
  }

  /**
   * Delete a category (Admin only)
   * Note: Will fail if category has associated products
   * @param id - Category ID
   * @returns Deleted category
   */
  @Delete(':id')
  @UseGuards(AuthGuard, AdminGuard)
  @Admin()
  @HttpCode(HttpStatus.OK)
  async remove(@Param('id', ParseIntPipe) id: number) {
    this.logger.log(`DELETE /categories/${id} - Deleting category`);
    const category = await this.categoryService.remove(id);

    return {
      success: true,
      message: 'Category deleted successfully',
      data: category,
    };
  }
}
