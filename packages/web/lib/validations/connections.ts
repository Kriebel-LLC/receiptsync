import * as z from "zod";
import { ConnectionType } from "shared/src/db/schema";

/**
 * Query params for listing connections
 */
export const getConnectionsQuerySchema = z.object({
  type: z.nativeEnum(ConnectionType).optional(),
});

export type GetConnectionsQueryType = z.infer<typeof getConnectionsQuerySchema>;

/**
 * Notion OAuth callback query params
 */
export const notionOAuthCallbackQuerySchema = z.object({
  code: z.string().optional(),
  state: z.string(), // orgId
  error: z.string().optional(),
});

export type NotionOAuthCallbackQueryType = z.infer<
  typeof notionOAuthCallbackQuerySchema
>;
