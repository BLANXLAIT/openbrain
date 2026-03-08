import { resolveIndexes, listAllVectors } from "../services/vectors";
import type { BrowseArgs, UserContext } from "../types";

export async function handleBrowseRecent(
  args: BrowseArgs,
  user: UserContext
): Promise<string> {
  const { limit = 10, type, topic, scope = "private" } = args;

  const indexes = resolveIndexes(user.userId, scope);

  // List from all target indexes in parallel
  const results = await Promise.all(indexes.map((idx) => listAllVectors(idx)));
  let all = results.flat();

  // Apply client-side filters
  if (type) {
    all = all.filter((v) => v.metadata.type === type);
  }
  if (topic) {
    all = all.filter((v) => {
      const topics = v.metadata.topics;
      return Array.isArray(topics) && topics.includes(topic);
    });
  }

  // Sort by created_at descending, take limit
  all.sort((a, b) => (b.metadata.created_at ?? 0) - (a.metadata.created_at ?? 0));
  const recent = all.slice(0, limit);

  if (!recent.length) return "No thoughts found.";

  return (
    `${recent.length} recent thought(s):\n\n` +
    recent
      .map((v) => {
        const m = v.metadata;
        const date = m.created_at
          ? new Date(m.created_at).toLocaleDateString()
          : "unknown";
        const topics = Array.isArray(m.topics)
          ? m.topics.join(", ")
          : "none";
        return `[${date}] ${m.type || "unknown"}\n${m.content || ""}\nTopics: ${topics}`;
      })
      .join("\n\n---\n\n")
  );
}
