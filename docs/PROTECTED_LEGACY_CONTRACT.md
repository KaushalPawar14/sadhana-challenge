# Protected legacy contract

This contract prevents the FOLK Surat expansion from deleting or silently replacing the working daily sādhana and guide-observation workflows.

## Student workflow that must remain available

- A student can open the calendar and create or edit a report for a selected date.
- Both existing student categories remain supported:
  - `sadhana-reports/{username}/dates/{dd-MM-yyyy}` for students staying at FOLK.
  - `hostel-sadhana/{username}/dates/{dd-MM-yyyy}` for students staying in hostels.
- The existing daily measures remain recoverable during migration:
  - sleep time;
  - waking time;
  - chanting rounds;
  - hearing / Bhagavatam class completion;
  - book-reading minutes; and
  - japa finish time.
- Submission continues to notify the guide-facing workflow.
- Existing calendar, graph, scorecard, book, competition and profile history remains readable.

## Guide workflow that must remain available

- Guides can see all students currently visible to them and open an individual profile.
- Guides can distinguish reports from `sadhana-reports` and `hostel-sadhana`.
- Guides can inspect reports by date, view trends and identify missing reports.
- Guides can send a reminder to students who have not submitted.
- Existing FCM registration and foreground notification handling remains functional until the replacement notification service passes parity tests.

## Migration rules

- Supabase becomes the canonical store only after record-count and field-level reconciliation.
- Firebase remains readable during the cutover and remains the FCM transport afterward.
- No legacy collection is deleted as part of Phase 1.
- Every migrated record stores its legacy collection, document path and source timestamp when available.
- Re-running an import must be idempotent and must not duplicate a daily entry.
- A student owns their daily entry. Assigned guides and the HOD may read it; guide corrections create a revision rather than silently overwriting the student's submission.
- New ABCDE fields extend the report. They do not remove the six original daily measures.

## Required regression scenarios

1. A FOLK-resident student submits today's report and sees it in the calendar.
2. A hostel student submits today's report and sees it in the calendar.
3. Editing a report produces the expected latest value and an audit revision.
4. A guide can see an assigned student's report but cannot see an unassigned student's private record.
5. The HOD can see the combined Surat view.
6. A student cannot see another student's report.
7. Missing-report calculation distinguishes submitted, missing and excused days.
8. A reminder is queued only for a missing student who has notifications enabled.
9. Re-importing the same Firebase record does not create a duplicate.
10. Disabling the new Supabase read path returns the application to the legacy read path during the controlled cutover.

This file is a release gate: any change that violates one of these guarantees must be corrected before merge.
