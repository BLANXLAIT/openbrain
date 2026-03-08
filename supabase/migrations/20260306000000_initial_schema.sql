-- Enable pgvector extension
create extension if not exists vector with schema extensions;

-- Create thoughts table
create table thoughts (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  embedding extensions.vector(1536),
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Index for vector similarity search (cosine distance)
create index on thoughts using hnsw (embedding extensions.vector_cosine_ops);

-- Index for metadata filtering
create index on thoughts using gin (metadata jsonb_path_ops);

-- Index for recent browsing
create index on thoughts (created_at desc);

-- Auto-update updated_at
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger thoughts_updated_at
  before update on thoughts
  for each row execute function update_updated_at();

-- Semantic search function
create or replace function match_thoughts(
  query_embedding extensions.vector(1536),
  match_threshold float default 0.5,
  match_count int default 10,
  filter jsonb default '{}'::jsonb
)
returns table (
  id uuid,
  content text,
  metadata jsonb,
  similarity float,
  created_at timestamptz
)
language plpgsql
as $$
begin
  return query
  select
    t.id,
    t.content,
    t.metadata,
    1 - (t.embedding <=> query_embedding) as similarity,
    t.created_at
  from thoughts t
  where 1 - (t.embedding <=> query_embedding) > match_threshold
    and (filter = '{}'::jsonb or t.metadata @> filter)
  order by t.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- Enable Row Level Security
alter table thoughts enable row level security;

-- Service role full access only
create policy "Service role full access"
  on thoughts
  for all
  using (auth.role() = 'service_role');
