# Trello integration contract

## Boundary

Supabase is the canonical database. Trello is an operational task surface for FOLK guides and the HOD. Student sādhana, LIT, private summaries, reflections and chat content are never treated as Trello-owned data.

## Eligible Trello cards

- approved student follow-up;
- association scheduling;
- birthday action;
- overdue commitment;
- book or hearing encouragement;
- trip or competition preparation;
- calendar verification;
- service opportunity;
- RDUA/content preparation; and
- HOD decision.

Cards contain only the minimum operational context: task title, CRM reference, college label, action type, assignee, due date, priority, approval state, checklist and a deep link back to the CRM. Private mentor narrative remains in Supabase.

## Recommended board workflow

1. New recommendations
2. Approved for action
3. This week
4. Scheduled / waiting
5. Completed
6. Needs HOD decision

## Synchronization

- The transactional outbox pattern records an approved CRM action before calling Trello.
- An idempotency key prevents duplicate cards.
- `X-Trello-Client-Identifier` identifies CRM-originated writes and prevents webhook loops.
- A signed Trello webhook updates only the task fields that Trello owns: list/status, due date, assignee, checklist completion and operational comments.
- Webhook signatures are verified using the application secret.
- Failed outbound calls are retried with capped exponential backoff and remain visible to the HOD.
- Supabase wins conflicts for student data, approval state and private context.
- Trello wins conflicts for the current operational task position after the task has been exported.

## Secret handling

The API token and application secret are server-side secrets. They are never compiled into Flutter or exposed through `NEXT_PUBLIC_*` variables. The API key may be public according to Trello's model, but it is still configured server-side for consistency.

## Test mode

Until a board and token are supplied, the adapter writes deterministic mock responses and webhook fixtures. Test mode must never send network requests to Trello.
