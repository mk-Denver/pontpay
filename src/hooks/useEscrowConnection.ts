/**
 * useEscrowConnection — connect to a PIP-01 escrow service and call its
 * HTTP API operations authenticated with NIP-98 (kind 27235).
 *
 * Implements the pontmore_escrow_http_v1 wire contract:
 *   /create              — open escrow, get enrollment tokens
 *   /funding_instructions — get BOLT11 invoice
 *   /fund_status         — poll funding state (created → active → released)
 *   /release             — release funds to recipient (Lightning Address)
 *   /refund              — refund to funder(s)
 *   /cancel              — cancel unfunded/partially funded escrow
 *   /disputes            — raise a dispute
 *   /coordination/root   — submit PIP-02 root event to escrow
 *   /coordination/action — submit PIP-02 action event to escrow
 *   /coordination/:id    — get coordination state
 *
 * Two-party funding: creator + counterparty, each contributes amount_sats.
 * funding_model: "1_of_2" (one funds) or "2_of_2" (both fund).
 * Payouts only to Lightning Addresses (user@domain.tld).
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
  pubkey: string;
  d: string;
  escrowType: string;
  endpoint: string;
  schemaType: string;
  schemaUrl: string;
  connectedAt: number;
}

// ─── API response types (matching the OpenAPI spec) ──────────────

export type FundingModel = '1_of_2' | '2_of_2';
export type EscrowState =
  | 'created' | 'partially_funded' | 'active'
  | 'release_pending' | 'disputed' | 'released'
  | 'refunded' | 'canceled';

export interface Enrollment {
  enrollment_token: string;
}

export interface CreateEscrowRequest {
  amount_sats: number;
  description: string;
  refund_ln_address?: string;
  application_pubkey?: string;
  idempotency_key?: string;
  funding_model: FundingModel;
}

export interface CreateEscrowResponse {
  escrow_id: string;
  state: 'created';
  creator_pubkey: string;
  counterparty_pubkey: string | null;
  amount_sats: number;
  platform_fee_sats: number;
  application_pubkey: string | null;
  funding_model: FundingModel;
  funding_threshold: number | null;
  participant_count: number | null;
  funding_deadline: string;
  enrollments: Enrollment[];
}

export interface JoinResponse {
  escrow_id: string;
  state: EscrowState;
  creator_pubkey: string;
  counterparty_pubkey: string;
  amount_sats: number;
  platform_fee_sats: number;
  application_pubkey: string | null;
  funding_model: FundingModel;
  funding_threshold: number | null;
  participant_count: number | null;
}

export interface FundingInstructionsResponse {
  escrow_id: string;
  funder_pubkey: string | null;
  payment_hash: string;
  payment_request: string;
  amount_sats: number;
  funding_model: FundingModel;
}

export interface FundStatusResponse {
  escrow_id: string;
  state: EscrowState;
  funded: boolean;
  funding_model: FundingModel;
  invoice_status: string | null;
  funded_count: number | null;
  total_funders: number | null;
  funding_threshold: number | null;
  my_funded: boolean | null;
  funder_status: string | null;
  application_pubkey: string | null;
}

export interface SignatureEntry {
  pubkey: string;
  signature: string;
}

export interface ReleaseDecisionRequest {
  release_decision:
    | 'mutual_consent'
    | 'operator_decision'
    | 'oracle_signature'
    | 'application_signed_result'
    | 'threshold_participant_signatures';
  recipient: string;
  nonce: string;
  timestamp: number;
  result?: Record<string, unknown> | null;
  threshold?: number | null;
  oracle_pubkey?: string | null;
  signatures: SignatureEntry[];
}

export interface ReleaseResponse {
  escrow_id: string;
  state: 'released';
  recipient: string;
  payout_sats: number;
  routing_fee_sats: number;
  net_payout_sats: number;
  payout: Record<string, unknown>;
}

export interface RefundResponse {
  escrow_id: string;
  state: 'refunded';
  recipient: 'creator';
  refund_sats: number;
  refunds?: Array<Record<string, unknown>>;
  payout: Record<string, unknown>;
}

export interface CancelResponse {
  escrow_id: string;
  state: 'canceled';
  refunds?: Array<Record<string, unknown>>;
}

export interface DisputeResponse {
  escrow_id: string;
  state: 'disputed';
  dispute_class: string;
  dispute_opened_by: string;
  dispute_opened_at: string;
}

export interface CoordinationStateResponse {
  coordination_id: string;
  state: string;
  terminal: boolean;
  forked: boolean;
  profile: string;
  root_event?: NostrEvent;
  actions?: Array<Record<string, unknown>>;
  derived_history?: Array<Record<string, unknown>>;
  errors?: string[];
}

export interface CoordinationActionResponse {
  action_id: string;
  action_type: string;
  coordination_id: string;
  state: string;
  terminal: boolean;
  errors?: string[];
}

// ─── Schema fetch helpers ──────────────────────────────────────────

const MAX_SCHEMA_SIZE = 1_048_576; // 1 MB per the spec
const SCHEMA_FETCH_TIMEOUT = 10_000;

function resolveOpenApiEndpoint(schema: Record<string, unknown>): string {
  if (Array.isArray(schema.servers) && schema.servers.length > 0) {
    const first = schema.servers[0] as Record<string, unknown>;
    if (typeof first.url === 'string') return first.url;
  }
  throw new Error('OpenAPI schema has no servers[0].url');
}

async function fetchSchemaEndpoint(schemaType: string, schemaUrl: string): Promise<string> {
  const url = new URL(schemaUrl);
  if (url.protocol !== 'https:') throw new Error('Schema URL must use https://');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SCHEMA_FETCH_TIMEOUT);

  try {
    const res = await fetch(schemaUrl, { signal: controller.signal });
    if (!res.ok) throw new Error(`Schema fetch failed: HTTP ${res.status}`);

    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('json')) throw new Error(`Schema must be JSON, got ${contentType}`);

    const text = await res.text();
    if (text.length > MAX_SCHEMA_SIZE) throw new Error(`Schema exceeds ${MAX_SCHEMA_SIZE} byte limit`);

    const schema = JSON.parse(text);
    if (!schema || typeof schema !== 'object') throw new Error('Invalid schema JSON');

    if (schemaType === 'openapi') return resolveOpenApiEndpoint(schema);
    throw new Error(`Unsupported schema type: ${schemaType}`);
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

  const disconnect = useCallback(() => {
    setConnection(null);
    toast({ title: 'Disconnected from escrow' });
  }, [setConnection, toast]);

  // ─── NIP-98 auth + fetch ───────────────────────────────────────

  const signNip98 = useCallback(
    async (method: string, url: string, body?: string): Promise<NostrEvent | null> => {
      if (!user) return null;
      const tags: string[][] = [['u', url], ['method', method.toUpperCase()]];
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

  const escrowFetch = useCallback(
    async <T>(
      operation: string,
      body?: Record<string, unknown>,
      method: string = 'POST',
    ): Promise<T> => {
      if (!connection) throw new Error('Not connected to an escrow');
      if (!user) throw new Error('Not logged in');

      const url = `${connection.endpoint}/${operation}`;
      const bodyStr = body ? JSON.stringify(body) : undefined;

      const authEvent = await signNip98(method, url, bodyStr);
      if (!authEvent) throw new Error('Failed to sign NIP-98 auth event');

      const authHeader = 'Nostr ' + btoa(unescape(encodeURIComponent(JSON.stringify(authEvent))));

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30_000);

      try {
        const res = await fetch(url, {
          method,
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
          },
          body: bodyStr ?? '{}',
          signal: controller.signal,
        });

        if (!res.ok) {
          const text = await res.text();
          let errorMsg: string;
          try { errorMsg = JSON.parse(text).error || `Escrow API error ${res.status}`; }
          catch { errorMsg = `Escrow API error ${res.status}: ${text.slice(0, 200)}`; }
          throw new Error(errorMsg);
        }
        return await res.json() as T;
      } finally {
        clearTimeout(timer);
      }
    },
    [connection, user, signNip98],
  );

  /** GET request for coordination state (uses path param, not body). */
  const escrowGet = useCallback(
    async <T>(path: string): Promise<T> => {
      if (!connection) throw new Error('Not connected to an escrow');
      if (!user) throw new Error('Not logged in');

      const url = `${connection.endpoint}/${path}`;
      const authEvent = await signNip98('GET', url);
      if (!authEvent) throw new Error('Failed to sign NIP-98 auth event');

      const authHeader = 'Nostr ' + btoa(unescape(encodeURIComponent(JSON.stringify(authEvent))));

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30_000);

      try {
        const res = await fetch(url, {
          method: 'GET',
          headers: { 'Authorization': authHeader },
          signal: controller.signal,
        });

        if (!res.ok) {
          const text = await res.text();
          let errorMsg: string;
          try { errorMsg = JSON.parse(text).error || `Escrow API error ${res.status}`; }
          catch { errorMsg = `Escrow API error ${res.status}: ${text.slice(0, 200)}`; }
          throw new Error(errorMsg);
        }
        return await res.json() as T;
      } finally {
        clearTimeout(timer);
      }
    },
    [connection, user, signNip98],
  );

  // ─── Escrow API operations ─────────────────────────────────────

  /** Create a new two-party escrow instance. Returns enrollment tokens. */
  const createEscrow = useCallback(
    (params: CreateEscrowRequest) => escrowFetch<CreateEscrowResponse>('create', { ...params }),
    [escrowFetch],
  );

  /** Join an existing escrow using an enrollment token.
   *  The `create` endpoint handles both new escrow creation and joining
   *  via enrollment token, per the pontmore_escrow_http_v1 contract. */
  const joinEscrow = useCallback(
    (enrollmentToken: string) =>
      escrowFetch<JoinResponse>('create', { enrollment_token: enrollmentToken }),
    [escrowFetch],
  );

  /** Get funding instructions (BOLT11 invoice) for a funder. */
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
    (escrowId: string, decision: ReleaseDecisionRequest) =>
      escrowFetch<ReleaseResponse>('release', { escrow_id: escrowId, decision }),
    [escrowFetch],
  );

  /** Refund escrowed funds to the funder(s). */
  const refundEscrow = useCallback(
    (escrowId: string, decision: ReleaseDecisionRequest) =>
      escrowFetch<RefundResponse>('refund', { escrow_id: escrowId, decision }),
    [escrowFetch],
  );

  /** Cancel an unfunded or partially funded escrow. */
  const cancelEscrow = useCallback(
    (escrowId: string) => escrowFetch<CancelResponse>('cancel', { escrow_id: escrowId }),
    [escrowFetch],
  );

  /** Raise a dispute on an active escrow. */
  const disputeEscrow = useCallback(
    (escrowId: string, disputeClass: string, summary?: string) =>
      escrowFetch<DisputeResponse>('disputes', { escrow_id: escrowId, dispute_class: disputeClass, summary }),
    [escrowFetch],
  );

  /** Submit a PIP-02 coordination root event to the escrow service. */
  const submitCoordinationRoot = useCallback(
    (event: NostrEvent) => escrowFetch<{ coordination_id: string; state: string; profile: string; valid: boolean }>('coordination/root', { event }),
    [escrowFetch],
  );

  /** Submit a PIP-02 coordination action event to the escrow service. */
  const submitCoordinationAction = useCallback(
    (event: NostrEvent) => escrowFetch<CoordinationActionResponse>('coordination/action', { event }),
    [escrowFetch],
  );

  /** Get the current derived coordination state from the escrow service. */
  const getCoordinationState = useCallback(
    (coordinationId: string) => escrowGet<CoordinationStateResponse>(`coordination/${encodeURIComponent(coordinationId)}`),
    [escrowGet],
  );

  return {
    connection,
    isConnected,
    isConnecting,
    endpoint: connection?.endpoint ?? null,
    connect,
    disconnect,
    // API operations
    createEscrow,
    joinEscrow,
    getFundingInstructions,
    getFundStatus,
    releaseEscrow,
    refundEscrow,
    cancelEscrow,
    disputeEscrow,
    submitCoordinationRoot,
    submitCoordinationAction,
    getCoordinationState,
  };
}
