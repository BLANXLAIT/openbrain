export interface ThoughtRow {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  similarity?: number;
  created_at: string;
  user_id: string;
  team_id?: string;
  visibility: "private" | "team" | "public";
}

export interface ThoughtMetadata {
  type: "observation" | "task" | "idea" | "reference" | "person_note";
  topics: string[];
  people: string[];
  action_items: string[];
  dates_mentioned: string[];
}

export interface McpRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export interface UserContext {
  userId: string;
  teamId?: string;
}

export interface SearchArgs {
  query: string;
  threshold?: number;
  limit?: number;
  type?: string;
  topic?: string;
  scope?: "mine" | "team" | "all";
}

export interface BrowseArgs {
  limit?: number;
  type?: string;
  topic?: string;
  scope?: "mine" | "team" | "all";
}

export interface CaptureArgs {
  text: string;
  visibility?: "private" | "team" | "public";
  team_id?: string;
}
