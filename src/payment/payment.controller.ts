import { Controller, Post, Body, Get, Param, HttpCode, HttpStatus, Req, Res, Logger, BadRequestException } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { Request, Response } from 'express';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaystackService } from './paystack.service';

@Controller('payments')
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);

  constructor(
    private readonly paymentService: PaymentService,
    private readonly paystackService: PaystackService
  ) { }

  @Post()
  async create(@Body() body: CreatePaymentDto) {
    const { userId, amount, currency = 'GHS', metadata } = body;
    this.logger.log(`Received payment creation request for User ${userId}`);
    return this.paymentService.createPayment(userId, amount, currency, metadata);
  }

  @Get('user/:id')
  async getByUser(@Param('id') id: string) {
    const userId = Number(id);
    return this.paymentService.getPaymentsByUser(userId);
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    const paymentId = Number(id);
    return this.paymentService.getPaymentById(paymentId);
  }

  /**
   * Verify a payment by reference
   * This endpoint can be called by the frontend after Paystack redirect
   */
  @Post('verify')
  async verifyPayment(@Body() body: { reference: string }) {
    const { reference } = body;

    if (!reference) {
      throw new BadRequestException('Payment reference is required');
    }

    try {
      this.logger.log(`Manual verification requested for ref: ${reference}`);
      const result = await this.paymentService.verifyAndSyncPayment(reference);
      return { success: true, ...result };
    } catch (error) {
      this.logger.error(`Verification failed for ref ${reference}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Verification failed',
      };
    }
  }

  /**
   * Paystack Webhook Handler
   */
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async webhook(@Req() req: Request, @Res() res: Response) {
    const signature = (req.headers['x-paystack-signature'] as string) || null;
    const rawBody = (req as any).rawBody ?? JSON.stringify(req.body);
    const payload = req.body;

    try {
      // 1. Verify signature
      const isValid = this.paystackService.verifySignature(rawBody, signature);

      if (!isValid && process.env.NODE_ENV === 'production') {
        this.logger.warn('INVALID WEBHOOK SIGNATURE received in production');
        return res.status(HttpStatus.BAD_REQUEST).json({ message: 'Invalid signature' });
      }

      if (!isValid) {
        this.logger.warn('Webhook signature mismatch (allowed in non-production)');
      }

      // 2. Process webhook event
      this.logger.log(`Processing Paystack webhook event: ${payload.event}`);
      const result = await this.paymentService.handleWebhook(payload);

      return res.status(HttpStatus.OK).json(result);
    } catch (err) {
      this.logger.error('Webhook processing error:', err);
      // Always return 200/OK to Paystack even on error to avoid retries if we've logged it
      // unless we want Paystack to retry. For critical errors, we might want a retry.
      return res.status(HttpStatus.OK).send();
    }
  }
}
