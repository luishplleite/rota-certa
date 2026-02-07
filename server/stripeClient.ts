import Stripe from 'stripe';

let connectionSettings: any;

// Check if we're running on Replit or external server
function isReplitEnvironment(): boolean {
  return !!(process.env.REPLIT_CONNECTORS_HOSTNAME && 
           (process.env.REPL_IDENTITY || process.env.WEB_REPL_RENEWAL));
}

// Get credentials from environment variables (for external servers)
function getEnvCredentials(): { publishableKey: string; secretKey: string } | null {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
  
  if (secretKey && publishableKey) {
    return { secretKey, publishableKey };
  }
  return null;
}

// Get credentials from Replit connector
async function getReplitCredentials(): Promise<{ publishableKey: string; secretKey: string }> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? 'depl ' + process.env.WEB_REPL_RENEWAL
      : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  const connectorName = 'stripe';
  const isProduction = process.env.REPLIT_DEPLOYMENT === '1';
  const targetEnvironment = isProduction ? 'production' : 'development';

  const url = new URL(`https://${hostname}/api/v2/connection`);
  url.searchParams.set('include_secrets', 'true');
  url.searchParams.set('connector_names', connectorName);
  url.searchParams.set('environment', targetEnvironment);

  const response = await fetch(url.toString(), {
    headers: {
      'Accept': 'application/json',
      'X_REPLIT_TOKEN': xReplitToken
    }
  });

  const data = await response.json();
  
  connectionSettings = data.items?.[0];

  if (!connectionSettings || (!connectionSettings.settings.publishable || !connectionSettings.settings.secret)) {
    throw new Error(`Stripe ${targetEnvironment} connection not found`);
  }

  return {
    publishableKey: connectionSettings.settings.publishable,
    secretKey: connectionSettings.settings.secret,
  };
}

// Main function to get credentials from any source
async function getCredentials(): Promise<{ publishableKey: string; secretKey: string }> {
  // First, try environment variables (works on any server)
  const envCreds = getEnvCredentials();
  if (envCreds) {
    console.log('STRIPE: Using credentials from environment variables');
    return envCreds;
  }

  // If on Replit, use the connector
  if (isReplitEnvironment()) {
    console.log('STRIPE: Using Replit connector for credentials');
    return getReplitCredentials();
  }

  throw new Error(
    'STRIPE: No credentials found. Please set STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY environment variables, ' +
    'or run on Replit with Stripe connector configured.'
  );
}

export async function getUncachableStripeClient() {
  const { secretKey } = await getCredentials();

  return new Stripe(secretKey, {
    apiVersion: '2025-05-28.basil' as any,
  });
}

export async function getStripePublishableKey() {
  const { publishableKey } = await getCredentials();
  return publishableKey;
}

export async function getStripeSecretKey() {
  const { secretKey } = await getCredentials();
  return secretKey;
}

// Get webhook secret for signature verification
export function getStripeWebhookSecret(): string | null {
  return process.env.STRIPE_WEBHOOK_SECRET || null;
}

let stripeSync: any = null;

export async function getStripeSync() {
  if (!stripeSync) {
    const { StripeSync } = await import('stripe-replit-sync');
    const secretKey = await getStripeSecretKey();

    stripeSync = new StripeSync({
      poolConfig: {
        connectionString: process.env.DATABASE_URL!,
        max: 2,
      },
      stripeSecretKey: secretKey,
    });
  }
  return stripeSync;
}
