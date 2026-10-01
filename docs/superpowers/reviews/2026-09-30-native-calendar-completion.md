# Native Canvas calendar completion verification

Version: 0.3.5. Verified on September 30, 2026 (America/Chicago).

## Behavior

Settings includes an account-scoped, default-off “Show extension completion on Canvas calendar” checkbox. Save planning settings applies it. Month, Week and Agenda display a purple dashed strike-through and ✓ P badge for locally completed assignments and events, independent of whether the Planning overlay has ever opened in that tab. The badge's accessible name and tooltip follow the account's saved language. Native Canvas completed titles retain their own original style.

FullCalendar identities are extracted by a small MAIN-world adapter from the rendered element's jQuery segment data. It supports both `fcSeg.footprint.eventDef.id` and `fcSeg.event.id`. Only typed assignment/event IDs are added to DOM attributes; no title matching, local state, or Canvas writes occur in that adapter. Agenda uses Canvas's existing `data-event-id` attributes. The isolated content script reads the current profile and account's local state, subscribes to storage changes, and verifies identity again when the page becomes visible or focused.

## Automated checks

- Baseline: 207 tests passed.
- Final feature suite: 217 tests passed, 0 failures.
- Production extension build passed; manifest, package and lockfile version are 0.3.5.
- Coverage added for default-off migration and account isolation, setting validation and saving, matching duplicate titles by ID, native-mark priority, month/agenda decoration without opening Planning, single/bulk completion and undo, DOM replacement and reused entries, account switch/sign-out cleanup, disposal, and both FullCalendar identity formats.
- Independent code review identified a FullCalendar 3.10 segment compatibility gap and an accessible badge role issue. Both were corrected; follow-up review found no remaining important issues and independently passed all 19 focused tests.

## Logged-in Chrome checks

Reloaded the existing unpacked extension and verified 0.3.5. Refreshed two existing Illinois Canvas calendar tabs.

1. Verified actual Month DOM entries receive the correct assignment/event IDs.
2. Enabled the new setting from the Chinese Settings UI and saved it. Existing local completion marks appeared in Month after closing Planning.
3. Temporarily marked Final Project Proposal complete in one tab. Another tab, with Planning never opened after reload, displayed the ✓ P badge and dashed title in Agenda immediately. Native Canvas completion remained independently styled.
4. Switched that tab to Week; visible locally completed items retained the mark. Returned it to Agenda.
5. Switched Month to November and back to October; the temporary task's mark was restored on the recreated element.
6. Reopened the temporary task through its extension detail and cleared completion; the other tab immediately removed its badge.
7. Restored the original task filter, disabled the new setting, and saved it. The other tab had zero extension badges while retaining native completed titles. Both Planning overlays ended closed; the temporary completion was restored to its original state.

Screenshots show the feature while enabled; the final saved preference is disabled.

- [Month verification](native-completion-month.jpg)
- [Agenda verification](native-completion-agenda.jpg)
- [Settings verification](native-completion-settings.jpg)

## Month/Week follow-up

The user requested that the same marks also appear in Month and Week. Read-only inspection found the account preference still disabled after the original verification, and one existing calendar tab had an invalidated extension context after a reload. Refreshed that old tab and enabled the account preference through Settings, saving successfully. No production code changes were necessary.

Verified both Month and Week visibly show ✓ P and dashed titles for local assignments `1625987` and `1625988`, with Planning closed. Returning from Week to Month retained both marks. Left the preference enabled and the new Month tab open for the user. The 19 focused native calendar/settings/storage tests passed again.

- [Month with the preference enabled](native-completion-month-enabled.jpg)
- [Week with the preference enabled](native-completion-week-enabled.jpg)
