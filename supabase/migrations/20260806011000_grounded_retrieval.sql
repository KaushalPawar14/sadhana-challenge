-- Retrieval is restricted to approved sources. Embeddings are supplied only by
-- the offline corpus importer after a human has reviewed the source inventory.

create index knowledge_chunks_embedding_hnsw_idx
  on public.knowledge_chunks
  using hnsw (embedding extensions.vector_cosine_ops)
  where embedding is not null;

create or replace function public.match_approved_knowledge_chunks(
  query_embedding extensions.vector(1536),
  match_count integer default 8,
  source_types text[] default null
)
returns table (
  chunk_id uuid,
  source_id uuid,
  source_title text,
  source_type text,
  citation_label text,
  heading_path text,
  content text,
  metadata jsonb,
  similarity double precision
)
language sql
stable
set search_path = ''
as $$
  select
    chunk.id,
    source.id,
    source.title,
    source.source_type,
    chunk.citation_label,
    chunk.heading_path,
    chunk.content,
    chunk.metadata,
    1 - (chunk.embedding operator(extensions.<=>) query_embedding) as similarity
  from public.knowledge_chunks as chunk
  join public.knowledge_sources as source on source.id = chunk.source_id
  where source.review_status = 'approved'
    and chunk.embedding is not null
    and (source_types is null or source.source_type = any(source_types))
  order by chunk.embedding operator(extensions.<=>) query_embedding
  limit greatest(1, least(match_count, 20));
$$;

revoke all on function public.match_approved_knowledge_chunks(extensions.vector, integer, text[]) from public, anon;
grant execute on function public.match_approved_knowledge_chunks(extensions.vector, integer, text[]) to authenticated;

insert into public.app_settings (key, value)
values
  ('rag_retrieval_source_status', 'approved_only'),
  ('rag_answer_contract', 'principle_guidance_with_citations_and_guide_handoff'),
  ('rag_embedding_dimensions', '1536')
on conflict (key) do update set value = excluded.value, updated_at = now();
