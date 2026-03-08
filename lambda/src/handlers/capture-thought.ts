import { randomUUID } from "crypto";
import { generateEmbedding } from "../services/embeddings";
import { extractMetadata } from "../services/metadata";
import { ensurePrivateIndex, putVector } from "../services/vectors";
import type { CaptureArgs, UserContext } from "../types";

export async function handleCaptureThought(
  args: CaptureArgs,
  user: UserContext
): Promise<string> {
  const { text, scope = "private" } = args;

  // Determine target index
  let indexName: string;
  if (scope === "shared") {
    indexName = "shared";
  } else {
    indexName = await ensurePrivateIndex(user.userId);
  }

  // Generate embedding and extract metadata in parallel
  const [embedding, metadata] = await Promise.all([
    generateEmbedding(text),
    extractMetadata(text),
  ]);

  const key = randomUUID();

  await putVector(indexName, key, embedding, {
    type: metadata.type,
    topics: metadata.topics,
    people: metadata.people,
    user_id: user.userId,
    created_at: Date.now(),
    content: text,
    action_items: JSON.stringify(metadata.action_items),
    dates_mentioned: JSON.stringify(metadata.dates_mentioned),
  });

  let confirmation = `Captured as ${metadata.type}`;
  if (metadata.topics.length > 0)
    confirmation += ` — ${metadata.topics.join(", ")}`;
  if (metadata.people.length > 0)
    confirmation += `\nPeople: ${metadata.people.join(", ")}`;
  if (metadata.action_items.length > 0)
    confirmation += `\nAction items: ${metadata.action_items.join("; ")}`;

  return confirmation;
}
