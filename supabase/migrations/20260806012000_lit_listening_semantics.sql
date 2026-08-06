alter table public.lit_assessments
  rename column learning_score to listening_score;

comment on column public.lit_assessments.listening_score is
  'Private mentor assessment of receptivity: willingness to listen, receive guidance and follow through. Not academic ability or a personality diagnosis.';
comment on column public.lit_assessments.interest_score is
  'Private mentor assessment of present interest in Krishna consciousness and philosophy.';
comment on column public.lit_assessments.time_score is
  'Private mentor assessment of time presently available for Krishna conscious activities; circumstances may change.';
