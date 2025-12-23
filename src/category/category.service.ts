import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoryService {
  private readonly logger = new Logger(CategoryService.name);

  constructor(private readonly prisma: PrismaService) { }

  /**
   * Create a new category with validation and error handling
   * @param createCategoryDto - Category data to create
   * @returns Created category with metadata
   */
  async create(createCategoryDto: CreateCategoryDto) {
    try {
      this.logger.log(`Creating category: ${createCategoryDto.name}`);

      // Check for existing category with same name (case-insensitive)
      const existing = await this.prisma.category.findFirst({
        where: {
          name: {
            equals: createCategoryDto.name,
            mode: 'insensitive',
          },
        },
      });

      if (existing) {
        throw new ConflictException(
          `Category "${createCategoryDto.name}" already exists. Please use a different name.`
        );
      }

      const category = await this.prisma.category.create({
        data: {
          name: createCategoryDto.name,
          description: createCategoryDto.description || '',
        },
        include: {
          _count: {
            select: { products: true },
          },
        },
      });

      this.logger.log(`Category created successfully: ${category.name} (ID: ${category.id})`);
      return category;
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      if (error.code === 'P2002') {
        throw new ConflictException(
          `Category "${createCategoryDto.name}" already exists. Please use a different name.`
        );
      }
      this.logger.error(`Error creating category: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Retrieve all categories with product counts
   * Optimized with proper ordering and counting
   * @returns Array of categories with product counts
   */
  async findAll() {
    try {
      this.logger.log('Fetching all categories');

      const categories = await this.prisma.category.findMany({
        orderBy: { name: 'asc' },
        include: {
          _count: {
            select: { products: true },
          },
        },
      });

      this.logger.log(`Retrieved ${categories.length} categories`);
      return categories;
    } catch (error) {
      this.logger.error(`Error fetching categories: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Find a single category by ID with related data
   * @param id - Category ID
   * @returns Category with products preview
   */
  async findOne(id: number) {
    try {
      this.logger.log(`Fetching category with ID: ${id}`);

      if (!id || id < 1) {
        throw new BadRequestException('Invalid category ID');
      }

      const category = await this.prisma.category.findUnique({
        where: { id },
        include: {
          products: {
            take: 5,
            orderBy: { createdAt: 'desc' },
          },
          _count: {
            select: { products: true },
          },
        },
      });

      if (!category) {
        throw new NotFoundException(
          `Category with ID ${id} not found. It may have been deleted.`
        );
      }

      this.logger.log(`Retrieved category: ${category.name} (ID: ${id})`);
      return category;
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(`Error fetching category ${id}: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Update an existing category
   * @param id - Category ID
   * @param updateCategoryDto - Updated category data
   * @returns Updated category
   */
  async update(id: number, updateCategoryDto: UpdateCategoryDto) {
    try {
      this.logger.log(`Updating category ID: ${id}`);

      if (!id || id < 1) {
        throw new BadRequestException('Invalid category ID');
      }

      // Check if updating to a name that already exists
      if (updateCategoryDto.name) {
        const existing = await this.prisma.category.findFirst({
          where: {
            name: {
              equals: updateCategoryDto.name,
              mode: 'insensitive',
            },
            NOT: { id },
          },
        });

        if (existing) {
          throw new ConflictException(
            `Category "${updateCategoryDto.name}" already exists. Please use a different name.`
          );
        }
      }

      const category = await this.prisma.category.update({
        where: { id },
        data: updateCategoryDto,
        include: {
          _count: {
            select: { products: true },
          },
        },
      });

      this.logger.log(`Category updated successfully: ${category.name} (ID: ${id})`);
      return category;
    } catch (error) {
      if (error instanceof ConflictException || error instanceof BadRequestException) {
        throw error;
      }
      if (error.code === 'P2025') {
        throw new NotFoundException(
          `Category with ID ${id} not found. It may have been deleted.`
        );
      }
      if (error.code === 'P2002') {
        throw new ConflictException(
          `Category "${updateCategoryDto.name}" already exists. Please use a different name.`
        );
      }
      this.logger.error(`Error updating category ${id}: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Delete a category
   * Note: This is a hard delete. Consider implementing soft delete for better data preservation
   * @param id - Category ID
   * @returns Deleted category
   */
  async remove(id: number) {
    try {
      this.logger.log(`Deleting category ID: ${id}`);

      if (!id || id < 1) {
        throw new BadRequestException('Invalid category ID');
      }

      // Check if category has products
      const category = await this.prisma.category.findUnique({
        where: { id },
        include: {
          _count: {
            select: { products: true },
          },
        },
      });

      if (!category) {
        throw new NotFoundException(
          `Category with ID ${id} not found. It may have been already deleted.`
        );
      }

      if (category._count.products > 0) {
        throw new ConflictException(
          `Cannot delete category "${category.name}" because it has ${category._count.products} associated product(s). Please reassign or remove the products first.`
        );
      }

      const deleted = await this.prisma.category.delete({
        where: { id },
      });

      this.logger.log(`Category deleted successfully: ${deleted.name} (ID: ${id})`);
      return deleted;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ConflictException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      if (error.code === 'P2025') {
        throw new NotFoundException(
          `Category with ID ${id} not found. It may have been already deleted.`
        );
      }
      this.logger.error(`Error deleting category ${id}: ${error.message}`, error.stack);
      throw error;
    }
  }
}
