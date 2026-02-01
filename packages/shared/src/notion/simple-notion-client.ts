/**
 * Lightweight Notion API client for Cloudflare Workers
 * Based on Finicom's implementation - works in edge environments where the official SDK doesn't
 */

export const DEFAULT_NOTION_VERSION = "2022-06-28";
export const NOTION_API_ROOT = "https://api.notion.com/v1";

// ============================================================================
// Types - Based on Notion API types
// ============================================================================

export interface SimpleNotionClientOptions {
  auth?: string;
  notionVersion?: string;
  fetch?: typeof fetch;
}

export class SimpleNotionClientError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "SimpleNotionClientError";
  }
}

// OAuth types
export interface OauthTokenParameters {
  code: string;
  grant_type: "authorization_code";
  redirect_uri: string;
}

export interface OauthTokenResponse {
  access_token: string;
  token_type: string;
  bot_id: string;
  workspace_id: string | null;
  workspace_name: string | null;
  workspace_icon: string | null;
  duplicated_template_id: string | null;
  owner: {
    type: "user" | "workspace";
    user?: {
      id: string;
      name: string | null;
      avatar_url: string | null;
      type: string;
      person?: { email: string };
    };
  };
}

// Search types
export interface SearchParameters {
  query?: string;
  filter?: {
    property: "object";
    value: "page" | "database";
  };
  sort?: {
    direction: "ascending" | "descending";
    timestamp: "last_edited_time";
  };
  start_cursor?: string;
  page_size?: number;
}

export interface SearchResponse {
  object: "list";
  results: DatabaseObjectResponse[];
  next_cursor: string | null;
  has_more: boolean;
  type: "page_or_database";
}

// Database types
export interface GetDatabaseParameters {
  database_id: string;
}

export interface QueryDatabaseParameters {
  database_id: string;
  filter?: DatabaseFilter;
  sorts?: DatabaseSort[];
  start_cursor?: string;
  page_size?: number;
  archived?: boolean;
}

export type DatabaseFilter =
  | { or: DatabaseFilter[] }
  | { and: DatabaseFilter[] }
  | PropertyFilter;

export interface PropertyFilter {
  property: string;
  title?: { equals?: string; contains?: string };
  rich_text?: { equals?: string; contains?: string };
  number?: { equals?: number; greater_than?: number; less_than?: number };
  checkbox?: { equals?: boolean };
  select?: { equals?: string };
  date?: { equals?: string; before?: string; after?: string };
}

export interface DatabaseSort {
  property?: string;
  timestamp?: "created_time" | "last_edited_time";
  direction: "ascending" | "descending";
}

export interface QueryDatabaseResponse {
  object: "list";
  results: PageObjectResponse[];
  next_cursor: string | null;
  has_more: boolean;
  type: "page_or_database";
}

// Page types
export interface CreatePageParameters {
  parent: { database_id: string } | { page_id: string };
  properties: PageProperties;
  icon?: PageIcon;
  cover?: PageCover;
}

export interface UpdatePageParameters {
  page_id: string;
  properties?: PageProperties;
  archived?: boolean;
  icon?: PageIcon;
  cover?: PageCover;
}

export type PageIcon =
  | { type: "emoji"; emoji: string }
  | { type: "external"; external: { url: string } };

export type PageCover = { type: "external"; external: { url: string } };

export type PageProperties = Record<string, PagePropertyValue>;

export type PagePropertyValue =
  | TitleProperty
  | RichTextProperty
  | NumberProperty
  | SelectProperty
  | MultiSelectProperty
  | DateProperty
  | CheckboxProperty
  | UrlProperty
  | EmailProperty
  | PhoneNumberProperty
  | FilesProperty
  | StatusProperty;

export interface TitleProperty {
  title: RichTextItem[];
}

export interface RichTextProperty {
  rich_text: RichTextItem[];
}

export interface RichTextItem {
  type?: "text";
  text: { content: string; link?: { url: string } | null };
  annotations?: {
    bold?: boolean;
    italic?: boolean;
    strikethrough?: boolean;
    underline?: boolean;
    code?: boolean;
    color?: string;
  };
}

export interface NumberProperty {
  number: number | null;
}

export interface SelectProperty {
  select: { name: string } | null;
}

export interface MultiSelectProperty {
  multi_select: { name: string }[];
}

export interface DateProperty {
  date: { start: string; end?: string | null; time_zone?: string | null } | null;
}

export interface CheckboxProperty {
  checkbox: boolean;
}

export interface UrlProperty {
  url: string | null;
}

export interface EmailProperty {
  email: string | null;
}

export interface PhoneNumberProperty {
  phone_number: string | null;
}

export interface FilesProperty {
  files: FileObject[];
}

export interface FileObject {
  type: "external";
  name: string;
  external: { url: string };
}

export interface StatusProperty {
  status: { name: string } | null;
}

// Database object response
export interface DatabaseObjectResponse {
  object: "database";
  id: string;
  created_time: string;
  last_edited_time: string;
  title: RichTextItem[];
  icon: PageIcon | null;
  cover: PageCover | null;
  properties: Record<string, DatabaseProperty>;
  archived: boolean;
  is_inline: boolean;
  url: string;
}

export interface DatabaseProperty {
  id: string;
  name: string;
  type: NotionPropertyType;
  [key: string]: unknown;
}

export type NotionPropertyType =
  | "title"
  | "rich_text"
  | "number"
  | "select"
  | "multi_select"
  | "date"
  | "checkbox"
  | "url"
  | "email"
  | "phone_number"
  | "files"
  | "created_time"
  | "last_edited_time"
  | "created_by"
  | "last_edited_by"
  | "status"
  | "formula"
  | "relation"
  | "rollup"
  | "people";

// Page object response
export interface PageObjectResponse {
  object: "page";
  id: string;
  created_time: string;
  last_edited_time: string;
  archived: boolean;
  icon: PageIcon | null;
  cover: PageCover | null;
  properties: Record<string, unknown>;
  url: string;
  parent: { type: "database_id"; database_id: string } | { type: "page_id"; page_id: string };
}

export type CreatePageResponse = PageObjectResponse;
export type UpdatePageResponse = PageObjectResponse;
export type GetDatabaseResponse = DatabaseObjectResponse;

// ============================================================================
// Client Implementation
// ============================================================================

export class SimpleNotionClient {
  private readonly auth?: string;
  private readonly notionVersion: string;
  private readonly _fetch: typeof fetch;

  constructor({
    auth,
    notionVersion = DEFAULT_NOTION_VERSION,
    fetch: customFetch,
  }: SimpleNotionClientOptions = {}) {
    this.auth = auth ?? "";
    this.notionVersion = notionVersion;
    this._fetch = customFetch ?? fetch.bind(globalThis);
  }

  /**
   * Database operations
   */
  public readonly databases = {
    /**
     * Retrieve a database by ID
     */
    retrieve: (args: GetDatabaseParameters): Promise<GetDatabaseResponse> => {
      const { database_id } = args;
      return this.request<GetDatabaseResponse>(
        `/databases/${database_id}`,
        "GET"
      );
    },

    /**
     * Query a database
     */
    query: (args: QueryDatabaseParameters): Promise<QueryDatabaseResponse> => {
      const { database_id, ...params } = args;
      return this.request<QueryDatabaseResponse>(
        `/databases/${database_id}/query`,
        "POST",
        params
      );
    },
  };

  /**
   * Page operations
   */
  public readonly pages = {
    /**
     * Create a new page (row in a database)
     */
    create: (args: CreatePageParameters): Promise<CreatePageResponse> => {
      return this.request<CreatePageResponse>("/pages", "POST", args);
    },

    /**
     * Update a page
     */
    update: (args: UpdatePageParameters): Promise<UpdatePageResponse> => {
      const { page_id, ...body } = args;
      return this.request<UpdatePageResponse>(
        `/pages/${page_id}`,
        "PATCH",
        body
      );
    },
  };

  /**
   * Search the workspace for databases and pages
   */
  public readonly search = async (
    params: SearchParameters
  ): Promise<SearchResponse> => {
    return this.request<SearchResponse>("/search", "POST", params);
  };

  /**
   * OAuth token exchange
   */
  public readonly oauth = {
    token: async (
      args: {
        client_id: string;
        client_secret: string;
      } & OauthTokenParameters
    ): Promise<OauthTokenResponse> => {
      const res = await this._fetch(`${NOTION_API_ROOT}/oauth/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${btoa(
            `${args.client_id}:${args.client_secret}`
          )}`,
        },
        body: JSON.stringify({
          code: args.code,
          grant_type: args.grant_type,
          redirect_uri: args.redirect_uri,
        }),
      });

      if (!res.ok) {
        let message = "OAuth token exchange failed";
        try {
          const errJson = (await res.json()) as { error?: string; message?: string };
          message = errJson.message ?? errJson.error ?? message;
        } catch {
          // Ignore JSON parse errors
        }
        throw new SimpleNotionClientError(message, "oauth_error", res.status);
      }

      return (await res.json()) as OauthTokenResponse;
    },
  };

  /**
   * Make a request to the Notion API
   */
  private async request<T>(
    path: string,
    method: "GET" | "POST" | "PATCH",
    body?: unknown
  ): Promise<T> {
    if (!this.auth) {
      throw new Error("Notion auth token is required for this operation");
    }

    const headers: HeadersInit = {
      Authorization: `Bearer ${this.auth}`,
      "Notion-Version": this.notionVersion,
    };

    if (body) {
      (headers as Record<string, string>)["Content-Type"] = "application/json";
    }

    const res = await this._fetch(`${NOTION_API_ROOT}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      let message = "Notion API request failed";
      let code = "unknown_error";
      try {
        const errJson = (await res.json()) as { code?: string; message?: string };
        message = errJson.message ?? message;
        code = errJson.code ?? code;
      } catch {
        // Ignore JSON parse errors
      }
      throw new SimpleNotionClientError(message, code, res.status);
    }

    return (await res.json()) as T;
  }
}

/**
 * Type guard for SimpleNotionClientError
 */
export function isSimpleNotionClientError(
  error: unknown
): error is SimpleNotionClientError {
  return error instanceof SimpleNotionClientError;
}
