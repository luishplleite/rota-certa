import { getStripeSync, getStripeWebhookSecret, getUncachableStripeClient } from './stripeClient';

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
        'Received type: ' + typeof payload + '. ' +
        'This usually means express.json() parsed the body before reaching this handler. ' +
        'FIX: Ensure webhook route is registered BEFORE app.use(express.json()).'
      );
    }

    const webhookSecret = getStripeWebhookSecret();
    
    // If we have a webhook secret, verify the signature first
    if (webhookSecret) {
      const stripe = await getUncachableStripeClient();
      try {
        // Verify the webhook signature
        stripe.webhooks.constructEvent(payload, signature, webhookSecret);
        console.log('STRIPE WEBHOOK: Signature verified successfully');
      } catch (err: any) {
        console.error('STRIPE WEBHOOK: Signature verification failed:', err.message);
        throw new Error(`Webhook signature verification failed: ${err.message}`);
      }
    } else {
      console.log('STRIPE WEBHOOK: No webhook secret configured, skipping signature verification');
    }

    const sync = await getStripeSync();
    await sync.processWebhook(payload, signature);
  }
}
