import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { extractUserContext } from "./auth/context";
import { handleSearchThoughts } from "./handlers/search-thoughts";
import { handleBrowseRecent } from "./handlers/browse-recent";
import { handleStats } from "./handlers/stats";
import { handleCaptureThought } from "./handlers/capture-thought";
import type { McpRequest, UserContext } from "./types";

// --- Tool definitions ---

const TOOLS = [
  {
    name: "search_thoughts",
    description:
      "Search your brain by meaning. Uses semantic similarity to find relevant thoughts regardless of exact keywords.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "What you're looking for — natural language",
        },
        threshold: {
          type: "number",
          description:
            "Similarity threshold 0-1 (lower = broader results)",
          default: 0.5,
        },
        limit: {
          type: "number",
          description: "Max results to return",
          default: 10,
        },
        type: {
          type: "string",
          description:
            "Filter by type: observation, task, idea, reference, person_note",
        },
        topic: { type: "string", description: "Filter by topic" },
        scope: {
          type: "string",
          description:
            "Scope: private (default, your thoughts only), shared (org-wide), all (both)",
          default: "private",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "browse_recent",
    description:
      "Browse recent thoughts chronologically. Optionally filter by type or topic.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Number of recent thoughts",
          default: 10,
        },
        type: {
          type: "string",
          description:
            "Filter by type: observation, task, idea, reference, person_note",
        },
        topic: { type: "string", description: "Filter by topic" },
        scope: {
          type: "string",
          description:
            "Scope: private (default), shared, all",
          default: "private",
        },
      },
    },
  },
  {
    name: "stats",
    description:
      "Get an overview of your brain — total thoughts, breakdown by type, top topics, and people mentioned.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "capture_thought",
    description:
      "Save a new thought to your brain. Automatically generates embedding and extracts metadata.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "The thought to capture" },
        scope: {
          type: "string",
          description:
            "Scope: private (default, only you can see it), shared (visible to the whole org)",
          default: "private",
        },
      },
      required: ["text"],
    },
  },
];

// --- JSON-RPC helpers ---

function jsonrpcResponse(
  id: string | number | null,
  result: unknown
): APIGatewayProxyResultV2 {
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id, result }),
  };
}

function jsonrpcError(
  id: string | number | null,
  code: number,
  message: string,
  statusCode = 200
): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      error: { code, message },
    }),
  };
}

// --- Lambda handler ---

export async function handler(
  event: APIGatewayProxyEventV2WithJWTAuthorizer | APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> {
  const method = event.requestContext.http.method;

  // Health check (GET, no auth required)
  if (method === "GET") {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ok", name: "enterprise-brain-mcp" }),
    };
  }

  if (method !== "POST") {
    return jsonrpcError(null, -32600, "Method not allowed", 405);
  }

  // Extract user from JWT (set by API Gateway authorizer)
  let user: UserContext;
  try {
    user = extractUserContext(
      event as APIGatewayProxyEventV2WithJWTAuthorizer
    );
  } catch {
    return jsonrpcError(null, -32600, "Unauthorized", 401);
  }

  const body: McpRequest = JSON.parse(event.body || "{}");
  const { method: rpcMethod, id, params } = body;

  // MCP: initialize
  if (rpcMethod === "initialize") {
    return jsonrpcResponse(id ?? null, {
      protocolVersion: "2025-03-26",
      capabilities: { tools: {} },
      serverInfo: { name: "enterprise-brain", version: "1.0.0" },
    });
  }

  // MCP: initialized notification
  if (rpcMethod === "notifications/initialized") {
    return { statusCode: 204, body: "" };
  }

  // MCP: list tools
  if (rpcMethod === "tools/list") {
    return jsonrpcResponse(id ?? null, { tools: TOOLS });
  }

  // MCP: call tool
  if (rpcMethod === "tools/call") {
    const toolName = params?.name as string;
    const args = (params?.arguments ?? {}) as Record<string, unknown>;

    let resultText: string;
    try {
      switch (toolName) {
        case "search_thoughts":
          resultText = await handleSearchThoughts(args as any, user);
          break;
        case "browse_recent":
          resultText = await handleBrowseRecent(args as any, user);
          break;
        case "stats":
          resultText = await handleStats(user);
          break;
        case "capture_thought":
          resultText = await handleCaptureThought(args as any, user);
          break;
        default:
          return jsonrpcError(id ?? null, -32601, `Unknown tool: ${toolName}`);
      }
    } catch (e) {
      resultText = `Error: ${(e as Error).message}`;
    }

    return jsonrpcResponse(id ?? null, {
      content: [{ type: "text", text: resultText }],
    });
  }

  // MCP: ping
  if (rpcMethod === "ping") {
    return jsonrpcResponse(id ?? null, {});
  }

  return jsonrpcError(id ?? null, -32601, `Method not found: ${rpcMethod}`);
}
