import { BadRequestException, ForbiddenException, Injectable, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderStatus } from './dto/update-order-status.dto';
import { PaymentService } from '../payment/payment.service';

@Injectable()
export class OrderService {
  constructor(private readonly prisma: PrismaService, private readonly paymentService: PaymentService) {}
  async createOrder(buyerId: number, dto: CreateOrderDto) {
    const { productId, quantity, whatsappNumber, callNumber, location, message, items } = dto as any;

    // Multi-item order flow
    if (items && Array.isArray(items) && items.length > 0) {
      // Aggregate quantities by productId in case of duplicates
      const agg: Record<number, number> = {};
      for (const it of items) {
        const pid = Number(it.productId);
        const qty = Number(it.quantity) || 0;
        if (!pid || qty < 1) throw new BadRequestException('Invalid items payload');
        agg[pid] = (agg[pid] || 0) + qty;
      }

      const productIds = Object.keys(agg).map(k => Number(k));

      const products = await this.prisma.product.findMany({
        where: { id: { in: productIds } },
        select: {
          id: true,
          title: true,
          userId: true,
          stock: true,
          isActive: true,
          isSold: true,
          originalPrice: true,
          discountedPrice: true,
        },
      });

      if (products.length !== productIds.length) {
        throw new NotFoundException('One or more products not found');
      }

      // Validate products and compute total
      let totalAmount = 0;
      for (const p of products) {
        const reqQty = agg[p.id] || 0;
        if (!p.isActive) throw new NotFoundException(`Product ${p.id} is inactive`);
        if (p.userId === buyerId) throw new ForbiddenException('You cannot order your own product');
        if (p.isSold || p.stock <= 0) throw new BadRequestException(`Product ${p.id} is sold out`);
        if (reqQty > p.stock) throw new BadRequestException(`Insufficient stock for product ${p.id}`);
        const unit = p.discountedPrice ?? p.originalPrice ?? 0;
        totalAmount += unit * reqQty;
      }

      // Build product updates and order create data
      const tx: any[] = [];
      for (const p of products) {
        const reqQty = agg[p.id] || 0;
        tx.push(
          this.prisma.product.update({
            where: { id: p.id },
            data: {
              stock: { decrement: reqQty },
              isSold: p.stock - reqQty <= 0 ? true : p.isSold,
            },
          }) as any,
        );
      }

      const orderCreate = (this.prisma as any).order.create({
        data: {
          buyerId,
          whatsappNumber,
          callNumber,
          location,
          buyerMessage: message,
          status: 'PENDING',
          currency: 'GHS',
          totalAmount,
          items: {
            create: products.map(p => ({
              productId: p.id,
              quantity: agg[p.id],
              unitPrice: p.discountedPrice ?? p.originalPrice ?? 0,
              productName: p.title,
            })),
          },
        },
        include: {
          items: {
            include: { product: { select: { id: true, userId: true, title: true } } },
          },
        },
      }) as any;

      tx.push(orderCreate);

      const results = await this.prisma.$transaction(tx as any);
      const createdOrder = results[results.length - 1];
      return createdOrder;
    }

    // Single-item order (existing behavior)
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        title: true,
        userId: true,
        stock: true,
        isActive: true,
        isSold: true,
        originalPrice: true,
        discountedPrice: true,
      },
    });

    if (!product || !product.isActive) {
      throw new NotFoundException('Product not found or inactive');
    }

    if (product.userId === buyerId) {
      throw new ForbiddenException('You cannot order your own product');
    }


    if (product.isSold || product.stock <= 0) {
      throw new BadRequestException('Product is sold out');
    }

    if (quantity > product.stock) {
      throw new BadRequestException('Insufficient stock for requested quantity');
    }

    const unitPrice = product.discountedPrice ?? product.originalPrice;
    const totalAmount = unitPrice * quantity;

    // Use a transaction to ensure atomic stock decrement + order creation
    const [updatedProduct, order] = await this.prisma.$transaction([
      this.prisma.product.update({
        where: { id: product.id },
        data: {
          stock: { decrement: quantity },
          isSold: product.stock - quantity <= 0 ? true : product.isSold,
        },
      }),
      (this.prisma as any).order.create({
        data: {
          buyerId,
          whatsappNumber,
          callNumber,
          location,
          buyerMessage: message,
          status: 'PENDING',
          currency: 'GHS',
          totalAmount,
          items: {
            create: {
              productId: product.id,
              quantity,
              unitPrice,
              productName: product.title,
            },
          },
        },
        include: {
          items: {
            include: { product: { select: { id: true, userId: true, title: true } } },
          },
        },
      }),
    ]);

    return order;
  }

  async getBuyerOrders(userId: number) {
    return (this.prisma as any).order.findMany({
      where: { buyerId: userId },
      orderBy: { createdAt: 'desc' },
      include: {
        items: {
          include: { product: { select: { id: true, title: true, imageUrl: true } } },
        },
      },
    });
  }


  async getOrderById(userId: number, orderId: number) {
    const order = await (this.prisma as any).order.findUnique({
      where: { id: orderId },
      include: {
        items: {
          include: { product: { select: { id: true, title: true, imageUrl: true, userId: true } } },
        },
      },
    });

    if (!order) throw new NotFoundException('Order not found');
    const isSeller = order.items.some((it: any) => it.product?.userId === userId);
    if (order.buyerId !== userId && !isSeller) {
      throw new ForbiddenException('You do not have access to this order');
    }
    return order;
  }

  async getSellerOrders(userId: number) {
    return (this.prisma as any).order.findMany({
      where: { items: { some: { product: { userId } } } },
      orderBy: { createdAt: 'desc' },
      include: {
        items: {
          include: { product: { select: { id: true, title: true, imageUrl: true, userId: true } } },
        },
      },
    });
  }

  /** Admin-only: hard delete order and restore product stocks */
  async deleteOrderAdmin(orderId: number) {
    const order = await (this.prisma as any).order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Order not found');

    const tx: any[] = [];
    for (const item of order.items) {
      tx.push(
        this.prisma.product.update({
          where: { id: item.productId },
          data: {
            stock: { increment: item.quantity },
            isSold: false,
          },
        }) as any,
      );
    }
    tx.push((this.prisma as any).order.delete({ where: { id: orderId } }));
    await this.prisma.$transaction(tx as any);
    return { success: true };
  }

  /** Admin-only: update order status with simple transition rules */
  async updateOrderStatusAdmin(orderId: number, status: OrderStatus) {
    const allowed = new Set(Object.values(OrderStatus));
    if (!allowed.has(status)) {
      throw new BadRequestException('Invalid order status');
    }

    const order = await (this.prisma as any).order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');

    // Basic transition control
    const current: OrderStatus = order.status as OrderStatus;
    const rank: Record<OrderStatus, number> = {
      [OrderStatus.PENDING]: 0,
      [OrderStatus.CONFIRMED]: 1,
      [OrderStatus.SHIPPED]: 2,
      [OrderStatus.DELIVERED]: 3,
      [OrderStatus.CANCELLED]: 99,
    } as const;

    if (status !== OrderStatus.CANCELLED && rank[status] < rank[current]) {
      throw new BadRequestException('Cannot move status backwards');
    }

    const updated = await (this.prisma as any).order.update({
      where: { id: orderId },
      data: { status },
      include: {
        items: {
          include: { product: { select: { id: true, title: true, imageUrl: true } } },
        },
      },
    });
    return updated;
  }

  /** Buyer initiates payment for an existing PENDING order. Returns payment + provider authorization if applicable. */
  async initiatePaymentForOrder(userId: number, orderId: number) {
    const order = await (this.prisma as any).order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.buyerId !== userId) throw new ForbiddenException('Not your order');
    if (order.status !== 'PENDING') {
      throw new BadRequestException('Order not in payable state');
    }

    const totalAmount = order.totalAmount;
    // Check for existing payment
    const existingPayment = await this.prisma.payment.findFirst({ where: { orderId: order.id } });
    if (existingPayment && existingPayment.status !== 'pending' && existingPayment.status !== 'PENDING') {
      // Payment already processed (success, failed, abandoned, etc.)
      return { reused: true, orderId: order.id, payment: existingPayment };
    }

    // Delete existing pending payment to create fresh one with new authorization URL
    if (existingPayment) {
      await this.prisma.payment.delete({ where: { id: existingPayment.id } });
    }

    // Create provider metadata referencing order
    const meta = { orderId: order.id, provider: 'paystack' };
    const result = await this.paymentService.createPayment(userId, totalAmount, order.currency, meta as any);
    if (!result.success) {
      throw new InternalServerErrorException(result.error || 'Payment initialization failed');
    }
    // Link payment to order
    await this.prisma.payment.update({
      where: { id: result.data.id },
      data: { orderId: order.id } as any,
    });
    return { orderId: order.id, payment: result.data, authorization: result.authorization };
  }
}
