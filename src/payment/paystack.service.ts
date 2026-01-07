import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import crypto from 'crypto';
import { PaystackInitializeResponse, PaystackVerifyResponse } from './types/paystack.types';

@Injectable()
export class PaystackService {
  private readonly logger = new Logger(PaystackService.name);
  private readonly secret = this.loadSecret();
  private readonly baseUrl = 'https://api.paystack.co';

  private loadSecret(): string | undefined {
    const keys = [
      process.env.PAYSTACK_SECRET_KEY,
      process.env.SECRET_KEY
    ];

    // Find the first key that isn't undefined, empty, or a placeholder
    return keys.find(k =>
      k &&
      k.trim() !== '' &&
      !k.includes('_your_secret_key_here') &&
      k.startsWith('sk_')
    );
  }

  /** Initialize a transaction on Paystack
   * amount should be in the main currency units (e.g. GHS). We'll convert to smallest unit by *100.
   */
  async initializeTransaction(email: string, amount: number, reference: string, callbackUrl?: string) {
    if (!this.secret) {
      this.logger.error('PAYSTACK_SECRET_KEY is missing');
      throw new InternalServerErrorException('Payment provider misconfigured');
    }

    const url = `${this.baseUrl}/transaction/initialize`;
    const body = {
      email,
      amount: Math.round(amount * 100), // convert to smallest currency unit (pesewas/kobo)
      reference,
      callback_url: callbackUrl ?? process.env.PAYSTACK_CALLBACK_URL,
    };

    try {
      this.logger.log(`Initializing Paystack transaction: email=${email} amount=${amount} ref=${reference}`);

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.secret}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data: PaystackInitializeResponse = await res.json();

      if (!res.ok || !data.status) {
        this.logger.error(`Paystack initialize failed: ${data.message || 'Unknown error'}`);
        throw new Error(data.message || 'Paystack initialization failed');
      }

      this.logger.log(`Paystack transaction initialized: ref=${reference}`);
      return data.data;
    } catch (err) {
      this.logger.error(`Paystack initialization error: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    }
  }

  async verifyTransaction(reference: string) {
    if (!this.secret) {
      this.logger.error('PAYSTACK_SECRET_KEY is missing');
      throw new InternalServerErrorException('Payment provider misconfigured');
    }

    const url = `${this.baseUrl}/transaction/verify/${encodeURIComponent(reference)}`;

    try {
      this.logger.log(`Verifying Paystack transaction: ref=${reference}`);

      const res = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${this.secret}` },
      });

      const data: PaystackVerifyResponse = await res.json();

      if (!res.ok || !data.status) {
        this.logger.error(`Paystack verify failed: ${data.message || 'Unknown error'}`);
        throw new Error(data.message || 'Paystack verify failed');
      }

      this.logger.log(`Paystack transaction verified: ref=${reference} status=${data.data.status}`);
      return data.data;
    } catch (err) {
      this.logger.error(`Paystack verification error: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    }
  }

  /** Verify Paystack webhook signature. Paystack sends HMAC-SHA512 of raw body using secret. */
  verifySignature(rawBody: string, signatureHeader?: string | null) {
    if (!this.secret) {
      this.logger.warn('PAYSTACK_SECRET_KEY not set; cannot verify signature');
      return false;
    }
    if (!signatureHeader) {
      this.logger.warn('Missing x-paystack-signature header');
      return false;
    }

    try {
      const hash = crypto.createHmac('sha512', this.secret).update(rawBody).digest('hex');
      const isValid = hash === signatureHeader;

      if (!isValid) {
        this.logger.warn('Paystack signature mismatch');
      }

      return isValid;
    } catch (err) {
      this.logger.error(`Error verifying signature: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }
}
