import { executeStatement, stringField, parseJsonRecords } from "../services/database";
import type { UserContext } from "../types";

export async function handleStats(user: UserContext): Promise<string> {
  const params = [{ name: "user_id", value: stringField(user.userId) }];

  // Get all thoughts visible to this user
  let visibilityClause = "(t.user_id = :user_id OR t.visibility = 'public')";
  if (user.teamId) {
    visibilityClause =
      "(t.user_id = :user_id OR t.visibility = 'public' OR (t.team_id = :team_id AND t.visibility = 'team'))";
    params.push({ name: "team_id", value: stringField(user.teamId) });
  }

  const sql = `
    SELECT t.metadata, t.created_at
    FROM thoughts t
    WHERE ${visibilityClause}
  `;

  const result = await executeStatement({ sql, parameters: params });
  const rows = parseJsonRecords<any>(result.formattedRecords);

  const total = rows.length;
  const types: Record<string, number> = {};
  const topics: Record<string, number> = {};
  const people: Record<string, number> = {};

  for (const row of rows) {
    const m = typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata;
    if (m?.type) types[m.type] = (types[m.type] || 0) + 1;
    for (const t of m?.topics || []) topics[t] = (topics[t] || 0) + 1;
    for (const p of m?.people || []) people[p] = (people[p] || 0) + 1;
  }

  const sortDesc = (obj: Record<string, number>) =>
    Object.entries(obj)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `  ${k}: ${v}`)
      .join("\n");

  const earliest = rows.length
    ? new Date(
        rows.reduce(
          (min: string, r: any) => (r.created_at < min ? r.created_at : min),
          rows[0].created_at
        )
      ).toLocaleDateString()
    : "N/A";

  return [
    `Total thoughts: ${total}`,
    `Since: ${earliest}`,
    `\nBy type:\n${sortDesc(types)}`,
    `\nTop topics:\n${sortDesc(topics)}`,
    Object.keys(people).length
      ? `\nPeople mentioned:\n${sortDesc(people)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}
