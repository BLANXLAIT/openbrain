import { executeStatement, stringField } from "../services/database";
import { generateEmbedding } from "../services/embeddings";
import { extractMetadata } from "../services/metadata";
import type { CaptureArgs, UserContext } from "../types";

export async function handleCaptureThought(
  args: CaptureArgs,
  user: UserContext
): Promise<string> {
  const { text, visibility = "private", team_id } = args;

  const [embedding, metadata] = await Promise.all([
    generateEmbedding(text),
    extractMetadata(text),
  ]);

  const embeddingStr = `[${embedding.join(",")}]`;
  const effectiveTeamId = team_id || user.teamId;

  const params: { name: string; value: any }[] = [
    { name: "content", value: stringField(text) },
    { name: "embedding", value: stringField(embeddingStr) },
    { name: "metadata", value: stringField(JSON.stringify(metadata)) },
    { name: "user_id", value: stringField(user.userId) },
    { name: "visibility", value: stringField(visibility) },
  ];

  let teamColumn = "";
  let teamValue = "";
  if (effectiveTeamId) {
    teamColumn = ", team_id";
    teamValue = ", :team_id";
    params.push({ name: "team_id", value: stringField(effectiveTeamId) });
  }

  const sql = `
    INSERT INTO thoughts (content, embedding, metadata, user_id, visibility${teamColumn})
    VALUES (:content, :embedding::vector, :metadata::jsonb, :user_id, :visibility::thought_visibility${teamValue})
  `;

  await executeStatement({ sql, parameters: params });

  let confirmation = `Captured as ${metadata.type}`;
  if (metadata.topics.length > 0) confirmation += ` — ${metadata.topics.join(", ")}`;
  if (metadata.people.length > 0) confirmation += `\nPeople: ${metadata.people.join(", ")}`;
  if (metadata.action_items.length > 0)
    confirmation += `\nAction items: ${metadata.action_items.join("; ")}`;

  return confirmation;
}
