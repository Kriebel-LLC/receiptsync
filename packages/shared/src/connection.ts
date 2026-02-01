/**
 * Connection management for OAuth integrations (Notion, Google, etc.)
 */

import { and, asc, desc, eq, notInArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "./db";
import {
  connections,
  ConnectionType,
  ConnectionStatus,
  Connection,
} from "./db/schema";
import { encrypt, decrypt } from "./encryption";
import {
  ConnectionMetadata,
  ConnectionDisplay,
  NotionConnectionMetadata,
  NotionConnectionMetadataSchema,
} from "./types/connection";
import { validateNotionConnection } from "./notion";
import { DBEnv, Env } from "./types";

// ============================================================================
// Types
// ============================================================================

export interface BackendEnv extends Env, DBEnv {}

export interface SlimConnection {
  id: string;
  type: ConnectionType;
  orgId: string;
  status: ConnectionStatus;
  metadata: ConnectionMetadata | null;
  error: Connection["error"];
}

export interface DecryptedConnection extends SlimConnection {
  decryptedAccessToken: string;
}

// ============================================================================
// Connection Validation
// ============================================================================

/**
 * Validate connection metadata matches the connection type
 */
export function validateConnectionMetadata(
  type: ConnectionType,
  metadata?: ConnectionMetadata
): boolean {
  if (!metadata) return true; // Metadata is optional

  switch (type) {
    case ConnectionType.Notion:
      return NotionConnectionMetadataSchema.safeParse(metadata).success;
    case ConnectionType.Google:
      // TODO: Add Google metadata validation when implemented
      return true;
    default:
      return false;
  }
}

/**
 * Validate that a connection works by testing the API
 */
export async function validateConnection(
  env: BackendEnv,
  connection: { type: ConnectionType; accessToken: string }
): Promise<boolean> {
  switch (connection.type) {
    case ConnectionType.Notion:
      return validateNotionConnection(connection.accessToken);
    case ConnectionType.Google:
      // TODO: Implement Google connection validation
      return true;
    default:
      return false;
  }
}

// ============================================================================
// Connection Operations
// ============================================================================

export class InvalidConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidConnectionError";
  }
}

/**
 * Create a new connection
 */
export async function createConnection({
  env,
  connectionType,
  orgId,
  accessToken,
  metadata,
}: {
  env: BackendEnv;
  connectionType: ConnectionType;
  orgId: string;
  accessToken: string;
  metadata?: ConnectionMetadata;
}): Promise<SlimConnection> {
  // Validate metadata matches connection type
  if (!validateConnectionMetadata(connectionType, metadata)) {
    throw new Error("Invalid connection metadata for type");
  }

  // Validate the connection actually works
  const isValid = await validateConnection(env, {
    type: connectionType,
    accessToken,
  });
  if (!isValid) {
    throw new InvalidConnectionError("Connection validation failed");
  }

  // Encrypt access token
  const encryptedToken = await encrypt(accessToken, env.ENCRYPTION_SECRET_KEY);

  const connection = {
    id: nanoid(),
    orgId,
    type: connectionType,
    accessToken: encryptedToken,
    status: ConnectionStatus.Active,
    metadata: metadata ?? null,
    error: null,
  };

  await db(env).insert(connections).values(connection);

  return {
    id: connection.id,
    type: connection.type,
    orgId: connection.orgId,
    status: connection.status,
    metadata: connection.metadata,
    error: connection.error,
  };
}

/**
 * Get connections for an org (without access token)
 */
export async function getSlimConnectionsForOrgId({
  env,
  orgId,
  type,
  excludingStatuses,
}: {
  env: BackendEnv;
  orgId: string;
  type?: ConnectionType;
  excludingStatuses?: ConnectionStatus[];
}): Promise<SlimConnection[]> {
  const conditions = [eq(connections.orgId, orgId)];

  if (type) {
    conditions.push(eq(connections.type, type));
  }

  if (excludingStatuses && excludingStatuses.length > 0) {
    conditions.push(notInArray(connections.status, excludingStatuses));
  }

  const results = await db(env)
    .select({
      id: connections.id,
      type: connections.type,
      orgId: connections.orgId,
      status: connections.status,
      metadata: connections.metadata,
      error: connections.error,
    })
    .from(connections)
    .where(and(...conditions))
    .orderBy(asc(connections.status), desc(connections.updatedAt));

  return results as SlimConnection[];
}

/**
 * Get a single connection by ID (without access token)
 */
export async function getSlimConnectionById({
  env,
  connectionId,
  orgId,
}: {
  env: BackendEnv;
  connectionId: string;
  orgId: string;
}): Promise<SlimConnection | null> {
  const result = await db(env)
    .select({
      id: connections.id,
      type: connections.type,
      orgId: connections.orgId,
      status: connections.status,
      metadata: connections.metadata,
      error: connections.error,
    })
    .from(connections)
    .where(
      and(eq(connections.id, connectionId), eq(connections.orgId, orgId))
    )
    .limit(1);

  return (result[0] as SlimConnection) ?? null;
}

/**
 * Get a connection with decrypted access token
 */
export async function getDecryptedConnectionById({
  env,
  connectionId,
  orgId,
}: {
  env: BackendEnv;
  connectionId: string;
  orgId: string;
}): Promise<DecryptedConnection | null> {
  const result = await db(env)
    .select()
    .from(connections)
    .where(
      and(eq(connections.id, connectionId), eq(connections.orgId, orgId))
    )
    .limit(1);

  if (result.length === 0) return null;

  const connection = result[0];
  const decryptedAccessToken = await decrypt(
    connection.accessToken,
    env.ENCRYPTION_SECRET_KEY
  );

  return {
    id: connection.id,
    type: connection.type as ConnectionType,
    orgId: connection.orgId,
    status: connection.status as ConnectionStatus,
    metadata: connection.metadata,
    error: connection.error,
    decryptedAccessToken,
  };
}

/**
 * Update connection status
 */
export async function updateConnectionStatus({
  env,
  connectionId,
  status,
  error,
}: {
  env: BackendEnv;
  connectionId: string;
  status: ConnectionStatus;
  error?: Connection["error"];
}): Promise<void> {
  await db(env)
    .update(connections)
    .set({ status, error: error ?? null })
    .where(eq(connections.id, connectionId));
}

/**
 * Archive a connection
 */
export async function archiveConnection({
  env,
  connectionId,
  orgId,
}: {
  env: BackendEnv;
  connectionId: string;
  orgId: string;
}): Promise<void> {
  await db(env)
    .update(connections)
    .set({ status: ConnectionStatus.Archived })
    .where(
      and(eq(connections.id, connectionId), eq(connections.orgId, orgId))
    );
}

// ============================================================================
// Display Helpers
// ============================================================================

/**
 * Convert slim connections to display format
 */
export function slimConnectionsToDisplays(
  slimConnections: SlimConnection[]
): ConnectionDisplay[] {
  return slimConnections.map((c) => ({
    id: c.id,
    type: c.type,
    status: c.status,
    metadata: c.metadata,
    error: c.error,
    createdAt: new Date(), // Would need to add createdAt to SlimConnection if needed
  }));
}
