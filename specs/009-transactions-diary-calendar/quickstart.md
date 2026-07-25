# Quickstart: Transactions Timeline, Child Diary & Staff Calendar

Manual verification steps once implementation is complete. Assumes the dev app is running (`npm run dev`)
against a local SQLite DB with migrations applied through this feature's changes (`child_illness_cases`,
`child_activities` added; `daily_payments`/`daily_payment_transactions` dropped).

## Part A — Daily Billing removal

1. Sign in as admin → confirm there is no "Daily Billing" entry in the main navigation.
2. Try navigating directly to the old Daily Billing route (if bookmarked) → confirm it is unreachable
   (redirect or 404-equivalent).
3. Open Sync Settings → trigger a push/pull → confirm no `daily_payments`/`daily_payment_transactions`
   activity appears in sync logs.

## Part B — Transactions tab

1. Open the new "Transactions" tab.
2. Select "Day" and pick today's date → confirm only today's payment-derived transactions are listed.
3. Select "Week" → confirm the Saturday–Friday window containing the picked date is used.
4. Select "Month" → confirm the full calendar month is used.
5. Select "Custom range" and pick a `from`/`to` spanning several weeks → confirm all transactions in that
   inclusive range appear, each showing child, service, amount, type, and date.

## Part C — Child Details: timetable, illness/activity, balance

1. Open a child with at least one enrolled service with `lesson_days`/teacher set.
2. Confirm the timetable section lists each scheduled day/time with its service and teacher.
3. Open a child with no scheduled services → confirm an empty state (not an error).
4. On a child with no open illness case, open the health section → confirm "Add Activity" is offered;
   add a note + a photo → confirm it appears in the diary with the photo visible.
5. Add another activity with a video attached → confirm it can be played back after saving.
6. Open an illness case for a child → confirm the health section now shows the illness case form/entry
   instead of "Add Activity", and that illness case entry still works as before.
7. On a child with partial payments, confirm both "Total Paid" and "Remaining Due" are shown and sum to
   the total due; on a fully-paid child, confirm "Remaining Due" shows zero.

## Part D — Shared Calendar page

1. Sign in as an employee (non-admin) → confirm the "Calendar" page is reachable and shows the same
   aggregated monthly schedule an admin would see (no rows hidden).
2. Click a specific day with scheduled entries → confirm the drill-down lists every person scheduled that
   day with their related service and teacher.
3. Click a day with nothing scheduled → confirm an empty state (not an error).
