/**
 * BTCPay Server Greenfield API client.
 *
 * Communicates with a BTCPay Server instance via the Greenfield REST API.
 * Used by the Super Agent hub-and-spoke architecture where:
 * - Super Agent operates the BTCPay Server (creates stores, issues API keys)
 * - Local Agents connect via scoped API keys (create invoices, check status)
 *
 * All requests go through the CORS proxy since BTCPay Server may not
 * have permissive CORS headers configured.
 *
 * Greenfield API docs: https://docs.btcpayserver.org/API/Greenfield/v1/
 */

/** Base CORS proxy URL for external API calls. */
const CORS_PROXY = 'https://proxy.shakespeare.diy/?url=';

/** Wrap a URL with the CORS proxy. */
function proxied(url: string): string {
  return `${CORS_PROXY}${encodeURIComponent(url)}`;
}

export interface BtcPayConfig {
  /** BTCPay Server base URL (e.g. https://btcpay.example.com). */
  serverUrl: string;
  /** Greenfield API key (scoped to a single store for local agents). */
  apiKey: string;
  /** Store ID (the Super Agent creates one per local agent). */
  storeId: string;
}

export interface BtcPayInvoice {
  id: string;
  amount: string;
  currency: string;
  status: BtcPayInvoiceStatus;
  checkoutLink: string;
  bolt11: string;
  paymentLink: string;
  createdTime: number;
  expirationTime: number;
  monitoringTime?: number;
}

export type BtcPayInvoiceStatus =
  | 'New'
  | 'Paid'
  | 'Processing'
  | 'Expired'
  | 'Invalid'
  | 'Settled';

export interface CreateInvoiceParams {
  amount: number;
  currency: string;
  description?: string;
  checkout?: {
    paymentMethods?: string[];
    expirationMinutes?: number;
  };
}

export interface BtcPayStore {
  id: string;
  name: string;
  website?: string;
  defaultCurrency?: string;
}

export interface BtcPayApiKey {
  apiKey: string;
  label?: string;
  permissions: string[];
}

/** Build the authorization header for Greenfield API requests. */
function authHeaders(apiKey: string): Record<string, string> {
  return {
    'Authorization': `token ${apiKey}`,
    'Content-Type': 'application/json',
  };
}

/** Strip trailing slash from a server URL. */
function normalizeUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

/** Make an authenticated Greenfield API request. */
async function apiRequest<T>(
  config: BtcPayConfig,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const url = `${normalizeUrl(config.serverUrl)}${path}`;
  const response = await fetch(proxied(url), {
    method,
    headers: authHeaders(config.apiKey),
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMsg = `BTCPay API error ${response.status}`;
    try {
      const errorJson = JSON.parse(errorText);
      errorMsg = errorJson.message || errorMsg;
    } catch {
      if (errorText) errorMsg = errorText;
    }
    throw new Error(errorMsg);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

// ─── Invoice Operations (Local Agent + Super Agent) ─────────────

/**
 * Create a Lightning invoice via BTCPay Server.
 * For hold invoices, the invoice will be in "Processing" state when
 * the customer pays — funds are locked but not settled.
 */
export async function createInvoice(
  config: BtcPayConfig,
  params: CreateInvoiceParams,
): Promise<BtcPayInvoice> {
  const body = {
    amount: params.amount.toString(),
    currency: params.currency,
    metadata: {
      description: params.description ?? 'Pontmore swap',
    },
    checkout: {
      paymentMethods: params.checkout?.paymentMethods ?? ['BTC-LightningNetwork'],
      expirationMinutes: params.checkout?.expirationMinutes ?? 60,
    },
  };

  return apiRequest<BtcPayInvoice>(
    config,
    'POST',
    `/api/v1/stores/${config.storeId}/invoices`,
    body,
  );
}

/**
 * Get the current status of an invoice.
 * Status transitions: New → Paid → Processing → Settled (or Expired/Invalid)
 *
 * "Processing" means the hold invoice is funded (locked) but not yet
 * settled — the customer must reveal the preimage to complete settlement.
 */
export async function getInvoice(
  config: BtcPayConfig,
  invoiceId: string,
): Promise<BtcPayInvoice> {
  return apiRequest<BtcPayInvoice>(
    config,
    'GET',
    `/api/v1/stores/${config.storeId}/invoices/${invoiceId}`,
  );
}

/**
 * Settle (mark as settled) an invoice.
 * This is called when the Local Agent confirms physical settlement
 * (cash handed over) and the preimage is revealed.
 */
export async function settleInvoice(
  config: BtcPayConfig,
  invoiceId: string,
): Promise<void> {
  await apiRequest(
    config,
    'POST',
    `/api/v1/stores/${config.storeId}/invoices/${invoiceId}/settle`,
  );
}

/**
 * Cancel an invoice.
 * Called by the Super Agent (as refund_authority) when a dispute is
 * resolved in favor of the customer, or when a swap times out.
 */
export async function cancelInvoice(
  config: BtcPayConfig,
  invoiceId: string,
): Promise<void> {
  await apiRequest(
    config,
    'POST',
    `/api/v1/stores/${config.storeId}/invoices/${invoiceId}/cancel`,
  );
}

// ─── Super Agent Operations (store + API key management) ─────────

/**
 * List all stores on the BTCPay Server.
 * Super Agent only — requires admin-level API key.
 */
export async function listStores(config: BtcPayConfig): Promise<BtcPayStore[]> {
  return apiRequest<BtcPayStore[]>(config, 'GET', '/api/v1/stores');
}

/**
 * Create a new store for a Local Agent.
 * Super Agent only — each local agent gets their own store.
 */
export async function createStore(
  config: BtcPayConfig,
  name: string,
  defaultCurrency?: string,
): Promise<BtcPayStore> {
  const body = {
    name,
    defaultCurrency: defaultCurrency ?? 'SATS',
  };

  return apiRequest<BtcPayStore>(config, 'POST', '/api/v1/stores', body);
}

/**
 * Generate a scoped API key for a Local Agent.
 * Super Agent only — the key is restricted to a single store with
 * limited permissions (create invoices, view status, settle, cancel).
 */
export async function createApiKey(
  config: BtcPayConfig,
  storeId: string,
  label: string,
): Promise<BtcPayApiKey> {
  const permissions = [
    `btcpay.store.canviewinvoices:${storeId}`,
    `btcpay.store.cancreateinvoice:${storeId}`,
    `btcpay.store.canmodifyinvoices:${storeId}`,
  ];

  const body = {
    label,
    permissions,
  };

  return apiRequest<BtcPayApiKey>(config, 'POST', '/api/v1/api-keys', body);
}

// ─── Polling helper ──────────────────────────────────────────────

/**
 * Poll an invoice until it reaches one of the target statuses.
 * Returns the final invoice state. Used to detect when a hold invoice
 * is funded (Processing) or settled (Settled).
 */
export async function pollInvoiceStatus(
  config: BtcPayConfig,
  invoiceId: string,
  targetStatuses: BtcPayInvoiceStatus[],
  intervalMs = 3000,
  timeoutMs = 300000,
): Promise<BtcPayInvoice> {
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        const invoice = await getInvoice(config, invoiceId);

        if (targetStatuses.includes(invoice.status)) {
          resolve(invoice);
          return;
        }

        // Check for terminal failure states
        if (invoice.status === 'Expired' || invoice.status === 'Invalid') {
          reject(new Error(`Invoice ${invoice.status.toLowerCase()}`));
          return;
        }

        if (Date.now() - startTime > timeoutMs) {
          reject(new Error('Invoice polling timed out'));
          return;
        }

        setTimeout(poll, intervalMs);
      } catch (err) {
        reject(err);
      }
    };

    poll();
  });
}
