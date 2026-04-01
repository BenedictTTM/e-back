import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { AddToCartDto, UpdateCartItemDto, MergeCartDto } from './dto';

@Injectable()
export class CartService {
  private readonly logger = new Logger(CartService.name);

  constructor(private readonly prisma: PrismaService) { }

  async addToCart(userId: number, addToCartDto: AddToCartDto) {
    const { productId, quantity } = addToCartDto;

    if (quantity < 1) {
      throw new BadRequestException('Quantity must be at least 1');
    }

    try {
      const product = await this.prisma.product.findUnique({
        where: { id: productId },
        select: { id: true, title: true, stock: true, originalPrice: true, discountedPrice: true },
      });

      if (!product) {
        throw new NotFoundException(`Product with ID ${productId} not found`);
      }

      const result = await this.prisma.$transaction(async (tx) => {
        let cart = await tx.cart.findUnique({
          where: { userId },
          include: { items: true },
        });

        if (!cart) {
          cart = await tx.cart.create({
            data: { userId },
            include: { items: true },
          });
        }

        const existingItem = await tx.cartItem.findUnique({
          where: { cartId_productId: { cartId: cart.id, productId } },
        });

        let finalQuantity: number;

        if (existingItem) {
          finalQuantity = existingItem.quantity + quantity;
          await tx.cartItem.update({
            where: { id: existingItem.id },
            data: { quantity: finalQuantity },
          });
        } else {
          finalQuantity = quantity;
          await tx.cartItem.create({
            data: { cartId: cart.id, productId, quantity: finalQuantity },
          });
        }

        if (finalQuantity > product.stock) {
          this.logger.warn(`Cart qty (${finalQuantity}) exceeds stock (${product.stock}) for product ${productId}`);
        }

        return tx.cart.findUnique({
          where: { id: cart.id },
          include: {
            items: {
              include: {
                product: {
                  select: {
                    id: true, title: true, description: true,
                    originalPrice: true, discountedPrice: true, imageUrl: true, stock: true,
                  },
                },
              },
            },
          },
        });
      });

      return this.formatCartResponse(result);
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) throw error;
      this.logger.error('Failed to add to cart:', error.message);
      throw new InternalServerErrorException('Failed to add item to cart', error.message);
    }
  }

  async getCart(userId: number) {
    try {
      const cart = await this.prisma.cart.findUnique({
        where: { userId },
        include: {
          items: {
            include: {
              product: {
                select: {
                  id: true, title: true, description: true,
                  originalPrice: true, discountedPrice: true, imageUrl: true, stock: true,
                },
              },
            },
          },
        },
      });

      if (!cart) return null;
      return this.formatCartResponse(cart);
    } catch (error) {
      throw new InternalServerErrorException('Failed to retrieve cart', error.message);
    }
  }

  async updateCartItem(userId: number, itemId: number, updateCartItemDto: UpdateCartItemDto) {
    const { quantity } = updateCartItemDto;

    if (quantity < 0) {
      throw new BadRequestException('Quantity cannot be negative');
    }

    try {
      const cartItem = await (this.prisma as any).cartItem.findUnique({
        where: { id: itemId },
        include: {
          cart: { select: { userId: true, id: true } },
          product: { select: { stock: true, title: true, id: true } },
        },
      });

      if (!cartItem || cartItem.cart.userId !== userId) {
        throw new NotFoundException('Cart item not found');
      }

      if (quantity === 0) {
        await this.prisma.cartItem.delete({ where: { id: itemId } });
      } else {
        await this.prisma.cartItem.update({
          where: { id: itemId },
          data: { quantity },
        });

        if (quantity > cartItem.product.stock) {
          this.logger.warn(`Cart qty (${quantity}) exceeds stock (${cartItem.product.stock}) for product ${cartItem.product.id}`);
        }
      }

      return this.getCart(userId);
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) throw error;
      this.logger.error('Failed to update cart item:', error.message);
      throw new InternalServerErrorException('Failed to update cart item', error.message);
    }
  }

  async removeCartItem(userId: number, itemId: number) {
    try {
      const cartItem = await this.prisma.cartItem.findUnique({
        where: { id: itemId },
        include: { cart: { select: { userId: true } } },
      });

      if (!cartItem || cartItem.cart.userId !== userId) {
        throw new NotFoundException('Cart item not found');
      }

      await this.prisma.cartItem.delete({ where: { id: itemId } });
      return this.getCart(userId);
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException('Failed to remove cart item', error.message);
    }
  }

  async clearCart(userId: number) {
    try {
      const cart = await this.prisma.cart.findUnique({ where: { userId } });
      if (!cart) throw new NotFoundException('Cart not found');

      await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
      return this.getCart(userId);
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new InternalServerErrorException('Failed to clear cart', error.message);
    }
  }

  async getCartItemCount(userId: number): Promise<number> {
    try {
      const cart = await this.prisma.cart.findUnique({
        where: { userId },
        include: { items: { select: { quantity: true } } },
      });

      if (!cart) return 0;
      return cart.items.reduce((total, item) => total + item.quantity, 0);
    } catch (error) {
      throw new InternalServerErrorException('Failed to get cart item count', error.message);
    }
  }

  async mergeCart(userId: number, mergeCartDto: MergeCartDto) {
    const { items } = mergeCartDto;

    const invalidItems = items.filter(item => item.quantity < 1);
    if (invalidItems.length > 0) {
      throw new BadRequestException('All quantities must be at least 1.');
    }

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        let cart = await tx.cart.findUnique({
          where: { userId },
          include: {
            items: {
              include: {
                product: {
                  select: { id: true, title: true, stock: true, originalPrice: true, discountedPrice: true },
                },
              },
            },
          },
        });

        if (!cart) {
          cart = await tx.cart.create({
            data: { userId },
            include: {
              items: {
                include: {
                  product: {
                    select: { id: true, title: true, stock: true, originalPrice: true, discountedPrice: true },
                  },
                },
              },
            },
          });
        }

        const productIds = items.map((item) => item.productId);
        const products = await tx.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, title: true, stock: true, originalPrice: true, discountedPrice: true },
        });

        if (products.length !== items.length) {
          const foundIds = products.map((p) => p.id);
          const missingIds = productIds.filter((id) => !foundIds.includes(id));
          throw new NotFoundException(`Products not found: ${missingIds.join(', ')}`);
        }

        const productMap = new Map(products.map((p) => [p.id, p]));

        for (const item of items) {
          const product = productMap.get(item.productId);
          if (!product) throw new NotFoundException(`Product with ID ${item.productId} not found`);

          const existingCartItem = cart.items.find((ci) => ci.product.id === item.productId);

          if (existingCartItem) {
            const newQuantity = existingCartItem.quantity + item.quantity;
            await tx.cartItem.update({
              where: { id: existingCartItem.id },
              data: { quantity: newQuantity },
            });
          } else {
            await tx.cartItem.create({
              data: { cartId: cart.id, productId: item.productId, quantity: item.quantity },
            });
          }
        }

        return tx.cart.findUnique({
          where: { id: cart.id },
          include: {
            items: {
              include: {
                product: {
                  select: {
                    id: true, title: true, description: true,
                    originalPrice: true, discountedPrice: true,
                    imageUrl: true, stock: true, condition: true, category: true,
                  },
                },
              },
            },
          },
        });
      });

      return this.formatCartResponse(result);
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) throw error;
      this.logger.error(`Cart merge failed for user ${userId}:`, error.message);
      throw new InternalServerErrorException('Failed to merge cart', error.message);
    }
  }

  private formatCartResponse(cart: any) {
    if (!cart) return null;

    let hasStockIssues = false;

    const items = cart.items.map((item: any) => {
      const effectivePrice = item.product.discountedPrice || item.product.originalPrice;
      const availableStock = item.product.stock || 0;
      const inStock = item.quantity <= availableStock;
      const exceedsStock = item.quantity > availableStock;

      if (exceedsStock) hasStockIssues = true;

      return {
        id: item.id,
        quantity: item.quantity,
        product: {
          ...item.product,
          stockStatus: {
            available: availableStock,
            inStock,
            exceedsStock,
            maxAvailable: exceedsStock ? availableStock : null,
          },
        },
        itemTotal: effectivePrice * item.quantity,
      };
    });

    const subtotal = items.reduce((total: number, item: any) => total + item.itemTotal, 0);
    const totalItems = items.reduce((total: number, item: any) => total + item.quantity, 0);

    return {
      id: cart.id,
      userId: cart.userId,
      items,
      subtotal: Number(subtotal.toFixed(2)),
      totalItems,
      hasStockIssues,
      createdAt: cart.createdAt,
      updatedAt: cart.updatedAt,
    };
  }
}
