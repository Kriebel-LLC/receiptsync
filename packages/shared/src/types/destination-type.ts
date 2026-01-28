/**
 * Destination types for ReceiptSync
 * Note: Values are stored in DB, so modifying existing values requires migration
 */
export enum DestinationType {
  GoogleSheets = "google_sheets",
  Notion = "notion",
}
