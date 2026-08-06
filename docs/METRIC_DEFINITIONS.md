# Weekly dashboard metric definitions

| Metric | Definition | Grain | Source | Guardrail |
| --- | --- | --- | --- | --- |
| Chanting bracket | Latest reported rounds in one exclusive bracket: 0–3, 4–7, 8–11, 12–15 or exactly 16 | Student-quarter snapshot | `activity_logs` | A student is counted in only one bracket. |
| Book journey completion | Student completed the required quarter books with position and completion evidence | Student-content item | `content_progress` | Opening a book is not completion. |
| Assigned hearing completion | Assigned module reached completion and a reflection/quiz was submitted | Student-content item | `content_progress` | Playback alone is insufficient. |
| Personal association minutes | Minutes from physical meetings, video calls and phone calls | Student-interaction | `mentor_interactions` | Service and post-program talk remain association, but not personal-minute targets. |
| Association recency | Days since the most recent meaningful personal interaction | Student-day | `mentor_interactions` | Do not treat recency alone as relationship quality. |
| Open commitment | A student commitment whose outcome has not yet been recorded | Student-commitment | `commitments` | Trip attendance itself is not spiritual advancement. |
| Weekly focus student | Assigned student selected because an evidence-backed next action is timely | Student-week | `weekly_focus_students` | Guide can edit or reject the recommendation. |
| Discount approval | Proposed expedition discount awaiting an authorized decision | Student-expedition | `approval_requests` | No notification or price change before approval. |

Prototype figures are representative and must always be visibly labelled until connected to live data.
