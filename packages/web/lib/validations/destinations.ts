import * as z from "zod";
import { DestinationType } from "shared/src/types/destination-type";
import {
  NotionDestinationConfigurationSchema,
  GoogleSheetsDestinationConfigurationSchema,
  NotionFieldMappingSchema,
} from "shared/src/types/destination";

/**
 * Route context for destination by ID
 */
export const destinationIdRouteContextSchema = z.object({
  params: z.object({
    name: z.string(),
    destinationId: z.string(),
  }),
});

export type DestinationIdRouteContextSchemaType = z.infer<
  typeof destinationIdRouteContextSchema
>;

/**
 * Create Notion destination request body
 */
export const createNotionDestinationSchema = z.object({
  type: z.literal(DestinationType.Notion),
  name: z.string().min(1).max(100),
  connectionId: z.string().min(1),
  configuration: NotionDestinationConfigurationSchema,
});

/**
 * Create Google Sheets destination request body
 */
export const createGoogleSheetsDestinationSchema = z.object({
  type: z.literal(DestinationType.GoogleSheets),
  name: z.string().min(1).max(100),
  connectionId: z.string().min(1),
  configuration: GoogleSheetsDestinationConfigurationSchema,
});

/**
 * Create destination request body (discriminated union)
 */
export const createDestinationSchema = z.discriminatedUnion("type", [
  createNotionDestinationSchema,
  createGoogleSheetsDestinationSchema,
]);

export type CreateDestinationType = z.infer<typeof createDestinationSchema>;

/**
 * Update destination request body
 */
export const updateDestinationSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  status: z.enum(["RUNNING", "PAUSED"]).optional(),
  configuration: z
    .union([
      NotionDestinationConfigurationSchema,
      GoogleSheetsDestinationConfigurationSchema,
    ])
    .optional(),
});

export type UpdateDestinationType = z.infer<typeof updateDestinationSchema>;
