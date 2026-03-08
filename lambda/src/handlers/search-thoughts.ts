import { executeStatement, stringField, doubleField, longField, parseJsonRecords } from "../services/database";
import { generateEmbedding } from "../services/embeddings";
import type { SearchArgs, UserContext } from "../types";

export async function handleSearchThoughts(
  args: SearchArgs,
  user: UserContext
): Promise<string> {
  const { query, threshold = 0.5, limit = 10, type, topic, scope = "mine" } = args;

  const embedding = await generateEmbedding(query);
  const embeddingStr = `[${embedding.join(",")}]`;

  // Build visibility filter based on scope
  let visibilityClause: string;
  const params: { name: string; value: any }[] = [
    { name: "embedding", value: stringField(embeddingStr) },
    { name: "threshold", value: doubleField(threshold) },
    { name: "match_count", value: longField(limit) },
    { name: "user_id", value: stringField(user.userId) },
  ];

  if (scope === "mine") {
    visibilityClause = "t.user_id = :user_id";
  } else if (scope === "team" && user.teamId) {
    visibilityClause =
      "(t.user_id = :user_id OR (t.team_id = :team_id AND t.visibility IN ('team', 'public')))";
    params.push({ name: "team_id", value: stringField(user.teamId) });
  } else {
    visibilityClause =
      "(t.user_id = :user_id OR t.visibility = 'public')";
  }

  let metadataFilter = "";
  if (type) {
    metadataFilter += " AND t.metadata->>'type' = :type_filter";
    params.push({ name: "type_filter", value: stringField(type) });
  }
  if (topic) {
    metadataFilter += " AND t.metadata->'topics' ? :topic_filter";
    params.push({ name: "topic_filter", value: stringField(topic) });
  }

  const sql = `
    SELECT t.id, t.content, t.metadata, t.created_at,
           1 - (t.embedding <=> :embedding::vector) AS similarity
    FROM thoughts t
    WHERE 1 - (t.embedding <=> :embedding::vector) > :threshold
      AND ${visibilityClause}
      ${metadataFilter}
    ORDER BY t.embedding <=> :embedding::vector
    LIMIT :match_count
  `;

  const result = await executeStatement({ sql, parameters: params });
  const rows = parseJsonRecords<any>(result.formattedRecords);

  if (!rows.length) return "No matching thoughts found. Try lowering the threshold.";

  return (
    `Found ${rows.length} thought(s):\n\n` +
    rows
      .map((t: any) => {
        const meta = typeof t.metadata === "string" ? JSON.parse(t.metadata) : t.metadata;
        return `[${new Date(t.created_at).toLocaleDateString()}] (${(t.similarity * 100).toFixed(0)}% match)\n${t.content}\nType: ${meta?.type || "unknown"} | Topics: ${meta?.topics?.join(", ") || "none"}`;
      })
      .join("\n\n---\n\n")
  );
}
