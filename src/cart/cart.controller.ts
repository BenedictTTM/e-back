import {
  Controller,  Get,  Post,  Patch,  Delete,  Body,
    Param,  ParseIntPipe,  UseGuards,
  Req,  HttpCode,  HttpStatus,} from '@nestjs/common';
import { CartService } from './cart.service';
import { AddToCartDto, UpdateCartItemDto, MergeCartDto } from './dto';
import { AuthGuard } from '../guards/auth.guard';


@Controller('cart')
@UseGuards(AuthGuard)
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async addToCart(@Req() req: any, @Body() addToCartDto: AddToCartDto) {
    const userId = req.user.id;
    return this.cartService.addToCart(userId, addToCartDto);
  }


  @Get()
  async getCart(@Req() req: any) {
    const userId = req.user.id;
    return this.cartService.getCart(userId);
  }

  @Get('count')
  async getCartItemCount(@Req() req: any) {
    const userId = req.user.id;
    const count = await this.cartService.getCartItemCount(userId);
    return { count };
  }

  @Post('merge')
  @HttpCode(HttpStatus.OK)
  async mergeCart(@Req() req: any, @Body() mergeCartDto: MergeCartDto) {
    const userId = req.user.id;
    return this.cartService.mergeCart(userId, mergeCartDto);
  }

  @Patch(':itemId')
  async updateCartItem(
    @Req() req: any,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() updateCartItemDto: UpdateCartItemDto,
  ) {
    const userId = req.user.id;
    return this.cartService.updateCartItem(userId, itemId, updateCartItemDto);
  }



  @Delete(':itemId')
  async removeCartItem(
    @Req() req: any,
    @Param('itemId', ParseIntPipe) itemId: number,
  ) {
    const userId = req.user.id;
    return this.cartService.removeCartItem(userId, itemId);
  }

  
  @Delete()
  async clearCart(@Req() req: any) {
    const userId = req.user.id;
    return this.cartService.clearCart(userId);
  }
}
