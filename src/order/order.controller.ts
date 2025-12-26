import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, Req, UseGuards, Delete, Patch } from '@nestjs/common';
import { OrderService } from './order.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { AuthGuard } from '../guards/auth.guard';
import { AdminGuard } from '../guards/admin.guard';
import { Admin } from '../decorators/admin.decorator';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';

@Controller('orders')
@UseGuards(AuthGuard)
export class OrderController {
  constructor(private readonly orderService: OrderService) { }

  /**
   * Create an order for a single product.
   * Body: { productId, quantity, whatsappNumber, callNumber, location?, message? }
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Req() req: any, @Body() dto: CreateOrderDto) {
    const userId = req.user.id;
    return this.orderService.createOrder(userId, dto);
  }

  /** Admin: Get all orders in the system */
  @Get('admin')
  @Admin()
  @UseGuards(AuthGuard, AdminGuard)
  async getAllOrders() {
    return this.orderService.getAllOrdersAdmin();
  }

  /** Get orders where the authenticated user is the buyer */
  @Get()
  async myOrders(@Req() req: any) {
    const userId = req.user.id;
    return this.orderService.getBuyerOrders(userId);
  }

  /** Get orders where the authenticated user is the seller */
  @Get('seller')
  async sellerOrders(@Req() req: any) {
    const userId = req.user.id;
    return this.orderService.getSellerOrders(userId);
  }

  /** Get a single order by id (buyer or seller only) */
  @Get(':id')
  async getById(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    const userId = req.user.id;
    return this.orderService.getOrderById(userId, id);
  }

  /** Admin: delete an order (restores stock for items) */
  @Delete(':id')
  @Admin()
  @UseGuards(AuthGuard, AdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteOrder(@Param('id', ParseIntPipe) id: number) {
    await this.orderService.deleteOrderAdmin(id);
  }

  /** Admin: update order status (e.g., SHIPPED, DELIVERED, CANCELLED) */
  @Patch(':id/status')
  @Admin()
  @UseGuards(AuthGuard, AdminGuard)
  @HttpCode(HttpStatus.OK)
  async updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.orderService.updateOrderStatusAdmin(id, dto.status);
  }

  /** Initiate payment for an order (buyer only) */
  @Post(':id/pay')
  @HttpCode(HttpStatus.CREATED)
  async payForOrder(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    const userId = req.user.id;
    return this.orderService.initiatePaymentForOrder(userId, id);
  }

  /** User cancels their own order */
  @Delete(':id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancelOrderUser(@Req() req: any, @Param('id', ParseIntPipe) id: number) {
    const userId = req.user.id;
    return this.orderService.cancelOrder(userId, id);
  }
}
