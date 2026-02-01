import { eq, and } from "drizzle-orm";
import { DrizzleD1Database } from "drizzle-orm/d1";
import { nanoid } from "nanoid";
import * as schema from "./db/schema";
import {
  Connection,
  ConnectionStatus,
  ConnectionType,
  connections,
} from "./db/schema";
import { encrypt, decrypt } from "./encryption";
import {
  ConnectionMetadata,
  GoogleConnectionMetadata,
  GoogleConnectionMetadataSchema,
  ConnectionErrorType,
} from "./types/connection";

// ============================================================================
// Types
// ============================================================================

/**
 * Connection with decrypted access token for use in API calls
 */
export interface DecryptedConnection extends Connection {
  decryptedAccessToken: string;
}

/**
 * Slim connection type for responses (without access token)
 */
export type SlimConnection = Omit<Connection, "accessToken">;

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate connection metadata based on connection type
 */
export function validateConnectionMetadata(
  type: ConnectionType,
  metadata?: ConnectionMetadata
): boolean {
  if (!metadata) return true;

  switch (type) {
    case ConnectionType.Google:
      return GoogleConnectionMetadataSchema.safeParse(metadata).success;
    case ConnectionType.Notion:
      // TODO: Add Notion metadata validation when implemented
      return true;
    default:
      return false;
  }
}

// ============================================================================
// Connection CRUD
// ============================================================================

interface CreateConnectionParams {
  db: DrizzleD1Database<typeof schema>;
  encryptionKey: string;
  connectionType: ConnectionType;
  orgId: string;
  accessToken: string;
  metadata?: ConnectionMetadata;
}

/**
 * Create a new connection with encrypted access token
 */
export async function createConnection({
  db,
  encryptionKey,
  connectionType,
  orgId,
  accessToken,
  metadata,
}: CreateConnectionParams): Promise<SlimConnection> {
  const isValidMetadata = validateConnectionMetadata(connectionType, metadata);
  if (!isValidMetadata) {
    throw new Error("Invalid connection metadata");
  }

  const encryptedToken = await encrypt(accessToken, encryptionKey);

  const connection = {
    id: nanoid(),
    orgId,
    type: connectionType,
    accessToken: encryptedToken,
    status: ConnectionStatus.Active,
    metadata: metadata ?? null,
    error: null,
    firstFailedAt: null,
    lastFailedAt: null,
  };

  await db.insert(connections).values(connection);

  // Return without access token
  const { accessToken: _, ...slimConnection } = connection;
  return slimConnection as SlimConnection;
}

interface UpdateConnectionParams {
  db: DrizzleD1Database<typeof schema>;
  encryptionKey: string;
  connectionId: string;
  orgId: string;
  newAccessToken?: string;
  metadataUpdates?: Partial<ConnectionMetadata>;
  status?: ConnectionStatus;
}

/**
 * Update an existing connection
 */
export async function updateConnection({
  db,
  encryptionKey,
  connectionId,
  orgId,
  newAccessToken,
  metadataUpdates,
  status,
}: UpdateConnectionParams): Promise<SlimConnection> {
  // First get the existing connection
  const [existing] = await db
    .select()
    .from(connections)
    .where(
      and(eq(connections.id, connectionId), eq(connections.orgId, orgId))
    );

  if (!existing) {
    throw new Error("Connection not found");
  }

  const updates: Partial<Connection> = {};

  if (newAccessToken) {
    updates.accessToken = await encrypt(newAccessToken, encryptionKey);
  }

  if (metadataUpdates) {
    updates.metadata = {
      ...existing.metadata,
      ...metadataUpdates,
    } as ConnectionMetadata;
  }

  if (status !== undefined) {
    updates.status = status;
    // Clear error state when reactivating
    if (status === ConnectionStatus.Active) {
      updates.error = null;
      updates.firstFailedAt = null;
      updates.lastFailedAt = null;
    }
  }

  const [updated] = await db
    .update(connections)
    .set(updates)
    .where(eq(connections.id, connectionId))
    .returning();

  // Return without access token
  const { accessToken: _, ...slimConnection } = updated;
  return slimConnection as SlimConnection;
}

/**
 * Get a connection by ID with decrypted access token
 */
export async function getDecryptedConnection(
  db: DrizzleD1Database<typeof schema>,
  encryptionKey: string,
  connectionId: string,
  orgId?: string
): Promise<DecryptedConnection | null> {
  const whereClause = orgId
    ? and(eq(connections.id, connectionId), eq(connections.orgId, orgId))
    : eq(connections.id, connectionId);

  const [connection] = await db
    .select()
    .from(connections)
    .where(whereClause);

  if (!connection) {
    return null;
  }

  const decryptedAccessToken = await decrypt(
    connection.accessToken,
    encryptionKey
  );

  return {
    ...connection,
    decryptedAccessToken,
  };
}

/**
 * Get all connections for an org
 */
export async function getConnectionsForOrg(
  db: DrizzleD1Database<typeof schema>,
  orgId: string,
  type?: ConnectionType
): Promise<SlimConnection[]> {
  const whereClause = type
    ? and(eq(connections.orgId, orgId), eq(connections.type, type))
    : eq(connections.orgId, orgId);

  const results = await db
    .select({
      id: connections.id,
      orgId: connections.orgId,
      type: connections.type,
      status: connections.status,
      metadata: connections.metadata,
      error: connections.error,
      firstFailedAt: connections.firstFailedAt,
      lastFailedAt: connections.lastFailedAt,
      createdAt: connections.createdAt,
      updatedAt: connections.updatedAt,
    })
    .from(connections)
    .where(whereClause);

  return results as SlimConnection[];
}

/**
 * Get active Google connections for an org
 */
export async function getActiveGoogleConnections(
  db: DrizzleD1Database<typeof schema>,
  orgId: string
): Promise<SlimConnection[]> {
  return db
    .select({
      id: connections.id,
      orgId: connections.orgId,
      type: connections.type,
      status: connections.status,
      metadata: connections.metadata,
      error: connections.error,
      firstFailedAt: connections.firstFailedAt,
      lastFailedAt: connections.lastFailedAt,
      createdAt: connections.createdAt,
      updatedAt: connections.updatedAt,
    })
    .from(connections)
    .where(
      and(
        eq(connections.orgId, orgId),
        eq(connections.type, ConnectionType.Google),
        eq(connections.status, ConnectionStatus.Active)
      )
    ) as unknown as Promise<SlimConnection[]>;
}

/**
 * Archive a connection
 */
export async function archiveConnection(
  db: DrizzleD1Database<typeof schema>,
  connectionId: string,
  orgId: string
): Promise<void> {
  await db
    .update(connections)
    .set({ status: ConnectionStatus.Archived })
    .where(
      and(eq(connections.id, connectionId), eq(connections.orgId, orgId))
    );
}

/**
 * Record a connection failure
 */
export async function recordConnectionFailure(
  db: DrizzleD1Database<typeof schema>,
  connectionId: string,
  errorMessage: string
): Promise<void> {
  const now = new Date();

  const [connection] = await db
    .select()
    .from(connections)
    .where(eq(connections.id, connectionId));

  if (!connection) return;

  const updates: Partial<Connection> = {
    lastFailedAt: now,
    error: {
      errorType: ConnectionErrorType.UnknownError,
      errorDisplayMessage: errorMessage,
    },
  };

  // Set firstFailedAt if this is the first failure
  if (!connection.firstFailedAt) {
    updates.firstFailedAt = now;
  }

  // If failures have been happening for more than 24 hours, mark as warning
  if (
    connection.firstFailedAt &&
    now.getTime() - connection.firstFailedAt.getTime() > 24 * 60 * 60 * 1000
  ) {
    updates.status = ConnectionStatus.Warning;
  }

  await db
    .update(connections)
    .set(updates)
    .where(eq(connections.id, connectionId));
}

/**
 * Clear connection error state on successful operation
 */
export async function clearConnectionError(
  db: DrizzleD1Database<typeof schema>,
  connectionId: string
): Promise<void> {
  await db
    .update(connections)
    .set({
      status: ConnectionStatus.Active,
      error: null,
      firstFailedAt: null,
      lastFailedAt: null,
    })
    .where(eq(connections.id, connectionId));
}
