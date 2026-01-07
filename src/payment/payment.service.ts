import { Injectable, InternalServerErrorException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaystackService } from './paystack.service';
import { PaystackWebhookPayload } from './types/paystack.types';

export type CreatePaymentResult = {
  success: boolean;
  data?: any;
  error?: string;
  authorization?: any;
  providerReference?: string;
};

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(private readonly prisma: PrismaService, private readonly paystackService: PaystackService) { }

  async createPayment(
    userId: number,
    amount: number,
    currency = 'GHS',
    meta?: Record<string, any>,
  ): Promise<CreatePaymentResult> {
    try {
      this.logger.log(`createPayment: user=${userId} amount=${amount} currency=${currency}`);

      // Basic validation
      if (!userId || amount <= 0) {
        throw new Error('Invalid userId or amount');
      }

      const createData: any = {
        userId,
        amount,
        currency,
        status: 'PENDING',
        providerPaymentId: meta?.providerPaymentId ?? null,
        metadata: meta ?? {},
      };

      const created = await this.prisma.payment.create({ data: createData });

      if (meta?.provider === 'paystack') {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        const email = user?.email || meta?.email;

        if (!email) {
          return { success: false, data: created, error: 'User email required for Paystack' };
        }

        try {
          const reference = `PAY-${created.id}-${Date.now()}`;
          const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
          const callbackUrl = `${frontendUrl}/payment-success`;

          const init = await this.paystackService.initializeTransaction(email, amount, reference, callbackUrl);

          await this.prisma.payment.update({
            where: { id: created.id },
            data: { providerPaymentId: init.reference },
          });

          return { success: true, data: created, authorization: init, providerReference: init.reference };
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          this.logger.error(`Paystack init failed for Payment ${created.id}:`, errorMsg);
          return { success: false, data: created, error: `Paystack: ${errorMsg}` };
        }
      }

      return { success: true, data: created };
    } catch (error) {
      this.logger.error('Failed to create payment:', error);
      throw new InternalServerErrorException('Payment creation failed');
    }
  }

  async handleWebhook(payload: PaystackWebhookPayload) {
    const { event, data } = payload;
    const reference = data.reference;

    this.logger.log(`Handling webhook event: ${event} for reference: ${reference}`);

    const payment = await this.prisma.payment.findUnique({
      where: { providerPaymentId: reference },
    });

    if (!payment) {
      this.logger.warn(`Payment not found for reference: ${reference}`);
      return { ok: false, message: 'Payment not found' };
    }

    if (event === 'charge.success') {
      return this.processSuccessfulPayment(payment.id, data);
    }

    // Handle other events if necessary (e.g., charge.failed)
    if (data.status === 'failed') {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED', metadata: { ...((payment.metadata as any) || {}), lastEvent: event } },
      });
    }

    return { ok: true };
  }

  private async processSuccessfulPayment(paymentId: number, paystackData: any) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const payment = await tx.payment.findUnique({
          where: { id: paymentId },
        });

        if (!payment || payment.status === 'SUCCESS') {
          return { ok: true, message: 'Already processed' };
        }

        // Update payment record
        const updatedPayment = await tx.payment.update({
          where: { id: paymentId },
          data: {
            status: 'SUCCESS',
            metadata: {
              ...(payment.metadata as any || {}),
              paid_at: paystackData.paid_at,
              channel: paystackData.channel,
            },
          },
        });

        // Update linked order if exists
        if (payment.orderId) {
          const order = await (tx as any).order.findUnique({ where: { id: payment.orderId } });
          if (order) {
            await (tx as any).order.update({
              where: { id: payment.orderId },
              data: {
                paymentStatus: 'PAID',
                status: 'CONFIRMED', // Auto-confirm once paid
              },
            });
            this.logger.log(`Order ${payment.orderId} updated to PAID and CONFIRMED`);
          }
        }

        return {
          status: 'SUCCESS',
          amount: updatedPayment.amount,
          reference: updatedPayment.providerPaymentId,
          paid_at: paystackData.paid_at,
          data: updatedPayment
        };
      });
    } catch (error) {
      this.logger.error(`Error processing success for payment ${paymentId}:`, error);
      throw error;
    }
  }

  async verifyAndSyncPayment(reference: string) {
    try {
      const paystackData = await this.paystackService.verifyTransaction(reference);

      const payment = await this.prisma.payment.findUnique({
        where: { providerPaymentId: reference },
      });

      if (!payment) throw new NotFoundException('Payment record not found');

      if (paystackData.status === 'success') {
        return this.processSuccessfulPayment(payment.id, paystackData);
      }

      return { ok: true, status: paystackData.status };
    } catch (error) {
      this.logger.error(`Error verifying and syncing payment ${reference}:`, error);
      throw error;
    }
  }

  async getPaymentsByUser(userId: number) {
    return this.prisma.payment.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPaymentById(id: number) {
    const payment = await this.prisma.payment.findUnique({ where: { id } });
    if (!payment) throw new NotFoundException('Payment not found');
    return payment;
  }
}
