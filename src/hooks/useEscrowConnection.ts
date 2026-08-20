/**
 * useEscrowConnection — connect to a discovered PIP-01 escrow service and
 * call its HTTP API operations (create, funding_instructions, fund_status,
 * release, refund, cancel) authenticated with NIP-98 (kind 27235).
 *
 * PIP-01 defines the service block as only a schema pointer ({ type, url }).
 * The endpoint and operations are resolved from the referenced OpenAPI/AsyncAPI
 * schema at connect time. NIP-98 auth events are signed by the user's Nostr
 * identity (via the Nostrify signer) — never published, only sent as the
 * Authorization header.
 */

import { useCallback, useState } from 'react';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useToast } from '@/hooks/useToast';
import type { NostrEvent } from '@nostrify/nostrify';
import type { PontmoreEscrow } from '@/lib/pontmore';

const NIP98_KIND = 27235;

/** Persisted escrow connection — resolved from a PIP-01 descriptor. */
export interface EscrowConnection {
  /** Operator's Nostr pubkey (from the kind 30361 event). */
  pubkey: string;
  /** d-tag identifier from the descriptor event. */
  d: string;
  /** Escrow type (e.g. "custodial_escrow", "lightning_hold_invoice"). */
  escrowType: string;
  /** HTTP endpoint base URL — resolved from the OpenAPI/AsyncAPI schema. */
  endpoint: string;
  /** Schema type (e.g. "openapi", "asyncapi") from service.schema.type. */
  schemaType: string;
  /** Schema URL from service.schema.url. */
  schemaUrl: string;
  /** When the connection was established. */
  connectedAt: number;
}

// ─── Escrow API response types ────────────────────────────────────

export interface CreateEscrowResponse {
  escrow_id: string;
  state: string;
  creator_pubkey: string;
  amount_sats: number;
  platform_fee_sats: number;
  funding_model: string;
  invitation_token?: string;
  counterparty_pubkey?: string;
}

export interface FundingInstructionsResponse {
  escrow_id: string;
  payment_hash: string;
  payment_request: string;
  amount_sats: number;
}

export interface FundStatusResponse {
  escrow_id: string;
  state: string;
  funded: boolean;
  invoice_status?: string;
}

export interface ReleaseResponse {
  escrow_id: string;
  state: string;
  recipient: string;
  payout_sats: number;
  payout?: { status: string; reason?: string; recipient_pubkey?: string };
}

export interface RefundResponse {
  escrow_id: string;
  state: string;
  recipient: string;
  refund_sats: number;
  payout?: { status: string; reason?: string };
}

export interface CancelResponse {
  escrow_id: string;
  state: string;
}

// ─── Schema fetch helpers ──────────────────────────────────────────

const MAX_SCHEMA_SIZE = 512 * 1024; // 512 KB
const SCHEMA_FETCH_TIMEOUT = 10_000; // 10 seconds

/** Resolve the base endpoint URL from an OpenAPI JSON schema. */
function resolveOpenApiEndpoint(schema: Record<string, unknown>): string {
  if (Array.isArray(schema.servers) && schema.servers.length > 0) {
    const first = schema.servers[0] as Record<string, unknown>;
    if (typeof first.url === 'string') return first.url;
  }
  throw new Error('OpenAPI schema has no servers[0].url');
}

/** Resolve the base endpoint from an AsyncAPI schema. */
function resolveAsyncApiEndpoint(schema: Record<string, unknown>): string {
  if (Array.isArray(schema.servers)) {
    const first = schema.servers[0] as Record<string, unknown>;
    if (first) {
      if (typeof first.url === 'string') return first.url;
      if (typeof first.host === 'string') {
        const protocol = typeof first.protocol === 'string' ? first.protocol : 'https';
        return `${protocol}://${first.host}`;
      }
    }
  }
  throw new Error('AsyncAPI schema has no resolvable server URL');
}

/**
 * Fetch and parse a service schema, returning the resolved endpoint URL.
 * Applies size limits, timeouts, and content-type checks per PIP-01 schema fetch safety.
 */
async function fetchSchemaEndpoint(schemaType: string, schemaUrl: string): Promise<string> {
  const url = new URL(schemaUrl);
  if (url.protocol !== 'https:') {
    throw new Error('Schema URL must use https://');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SCHEMA_FETCH_TIMEOUT);

  try {
    const res = await fetch(schemaUrl, { signal: controller.signal });
    if (!res.ok) throw new Error(`Schema fetch failed: HTTP ${res.status}`);

    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('json')) {
      throw new Error(`Schema must be JSON, got ${contentType}`);
    }

    const text = await res.text();
    if (text.length > MAX_SCHEMA_SIZE) {
      throw new Error(`Schema exceeds ${MAX_SCHEMA_SIZE} byte limit`);
    }

    const schema = JSON.parse(text);
    if (!schema || typeof schema !== 'object') {
      throw new Error('Invalid schema JSON');
    }

    switch (schemaType) {
      case 'openapi': return resolveOpenApiEndpoint(schema);
      case 'asyncapi': return resolveAsyncApiEndpoint(schema);
      default: throw new Error(`Unsupported schema type: ${schemaType}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

// ─── Hook ──────────────────────────────────────────────────────────

export function useEscrowConnection() {
  const { user } = useCurrentUser();
  const { toast } = useToast();
  const [connection, setConnection] = useLocalStorage<EscrowConnection | null>(
    'pontpay-escrow-connection',
    null,
  );
  const [isConnecting, setIsConnecting] = useState(false);

  const isConnected = !!connection && !!user;

  /** Connect to an escrow descriptor discovered on Nostr.
   *  Resolves the service endpoint from the referenced schema per PIP-01. */
  const connect = useCallback(
    async (escrow: PontmoreEscrow) => {
      const schema = escrow.service?.schema;
      if (!schema?.url) {
        toast({ title: 'Cannot connect', description: 'This escrow has no service schema.', variant: 'destructive' });
        return;
      }

      setIsConnecting(true);
      try {
        const endpoint = await fetchSchemaEndpoint(schema.type, schema.url);

        const conn: EscrowConnection = {
          pubkey: escrow.event.pubkey,
          d: escrow.d,
          escrowType: escrow.escrowType,
          endpoint,
          schemaType: schema.type,
          schemaUrl: schema.url,
          connectedAt: Date.now(),
        };
        setConnection(conn);
        toast({ title: 'Connected to escrow', description: endpoint });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Schema fetch failed';
        toast({ title: 'Connection failed', description: msg, variant: 'destructive' });
      } finally {
        setIsConnecting(false);
      }
    },
    [setConnection, toast],
  );

  /** Disconnect from the current escrow. */
  const disconnect = useCallback(() => {
    setConnection(null);
    toast({ title: 'Disconnected from escrow' });
  }, [setConnection, toast]);

  // ─── NIP-98 auth + fetch ───────────────────────────────────────

  /**
   * Sign a NIP-98 (kind 27235) auth event for an HTTP request.
   * Uses the user's Nostrify signer — the event is signed but NOT published.
   */
  const signNip98 = useCallback(
    async (method: string, url: string, body?: string): Promise<NostrEvent | null> => {
      if (!user) return null;

      const tags: string[][] = [
        ['u', url],
        ['method', method.toUpperCase()],
      ];

      if (body) {
        const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
        const payloadHash = Array.from(new Uint8Array(hash))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
        tags.push(['payload', payloadHash]);
      }

      return user.signer.signEvent({
        kind: NIP98_KIND,
        content: '',
        tags,
        created_at: Math.floor(Date.now() / 1000),
      });
    },
    [user],
  );

  /**
   * Make an authenticated request to the connected escrow's HTTP API.
   * Signs a NIP-98 event and sends it as the Authorization header.
   */
  const escrowFetch = useCallback(
    async <T>(
      operation: string,
      body?: Record<string, unknown>,
    ): Promise<T> => {
      if (!connection) throw new Error('Not connected to an escrow');
      if (!user) throw new Error('Not logged in');

      const url = `${connection.endpoint}/${operation}`;
      const bodyStr = body ? JSON.stringify(body) : undefined;

      const authEvent = await signNip98('POST', url, bodyStr);
      if (!authEvent) throw new Error('Failed to sign NIP-98 auth event');

      const authHeader = 'Nostr ' + btoa(JSON.stringify(authEvent));

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
        body: bodyStr ?? '{}',
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Escrow API error ${res.status}`);
      return data as T;
    },
    [connection, user, signNip98],
  );

  // ─── Escrow API operations ─────────────────────────────────────

  /** Create a new escrow instance. */
  const createEscrow = useCallback(
    (params: {
      amount_sats: number;
      description?: string;
      refund_ln_address?: string;
      idempotency_key?: string;
      invitation_token?: string;
    }) => escrowFetch<CreateEscrowResponse>('create', params),
    [escrowFetch],
  );

  /** Get funding instructions (Lightning invoice) for an escrow. */
  const getFundingInstructions = useCallback(
    (escrowId: string) => escrowFetch<FundingInstructionsResponse>('funding_instructions', { escrow_id: escrowId }),
    [escrowFetch],
  );

  /** Check the funding status of an escrow. */
  const getFundStatus = useCallback(
    (escrowId: string) => escrowFetch<FundStatusResponse>('fund_status', { escrow_id: escrowId }),
    [escrowFetch],
  );

  /** Release escrowed funds to the recipient. */
  const releaseEscrow = useCallback(
    (params: { escrow_id: string; decision: Record<string, unknown> }) =>
      escrowFetch<ReleaseResponse>('release', params),
    [escrowFetch],
  );

  /** Refund escrowed funds to the funder. */
  const refundEscrow = useCallback(
    (params: { escrow_id: string; decision: Record<string, unknown> }) =>
      escrowFetch<RefundResponse>('refund', params),
    [escrowFetch],
  );

  /** Cancel an unfunded escrow. */
  const cancelEscrow = useCallback(
    (escrowId: string) => escrowFetch<CancelResponse>('cancel', { escrow_id: escrowId }),
    [escrowFetch],
  );

  return {
    // State
    connection,
    isConnected,
    isConnecting,
    endpoint: connection?.endpoint ?? null,
    // Connection
    connect,
    disconnect,
    // API operations
    createEscrow,
    getFundingInstructions,
    getFundStatus,
    releaseEscrow,
    refundEscrow,
    cancelEscrow,
  };
}