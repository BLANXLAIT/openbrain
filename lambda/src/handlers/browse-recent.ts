import { executeStatement, stringField, longField, parseJsonRecords } from "../services/database";
import type { BrowseArgs, UserContext } from "../types";

export async function handleBrowseRecent(
  args: BrowseArgs,
  user: UserContext
): Promise<string> {
  const { limit = 10, type, topic, scope = "mine" } = args;

  const params: { name: string; value: any }[] = [
    { name: "user_id", value: stringField(user.userId) },
    { name: "lim", value: longField(limit) },
  ];

  let visibilityClause: string;
  if (scope === "mine") {
    visibilityClause = "t.user_id = :user_id";
  } else if (scope === "team" && user.teamId) {
    visibilityClause =
      "(t.user_id = :user_id OR (t.team_id = :team_id AND t.visibility IN ('team', 'public')))";
    params.push({ name: "team_id", value: stringField(user.teamId) });
  } else {
    visibilityClause = "(t.user_id = :user_id OR t.visibility = 'public')";
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
    SELECT t.id, t.content, t.metadata, t.created_at
    FROM thoughts t
    WHERE ${visibilityClause}
      ${metadataFilter}
    ORDER BY t.created_at DESC
    LIMIT :lim
  `;

  const result = await executeStatement({ sql, parameters: params });
  const rows = parseJsonRecords<any>(result.formattedRecords);

  if (!rows.length) return "No thoughts found.";

  return (
    `${rows.length} recent thought(s):\n\n` +
    rows
      .map((t: any) => {
        const meta = typeof t.metadata === "string" ? JSON.parse(t.metadata) : t.metadata;
        return `[${new Date(t.created_at).toLocaleDateString()}] ${meta?.type || "unknown"}\n${t.content}\nTopics: ${meta?.topics?.join(", ") || "none"}`;
      })
      .join("\n\n---\n\n")
  );
}
