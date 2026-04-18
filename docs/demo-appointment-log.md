# Demo Appointment Log

| Logged At | Action | Patient | Scheduled At | Conversation ID | Candidate | Audit ID | Note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-04-18T13:31:24.849Z | booked | TEST Codex Demo 202604181330 | 2026-10-20 11:30 | conv_codex_live_exec_retry_1776519022157 | 2026-10-20 11:30 | 2026-04-18T13-31-24-841Z-conv_codex_live_exec_retry_1776519022157-execute | Initial live retry. Later inspection found a split result: treatment remained on 2026-10-20 12:00 and a stray T/S remained on 2026-10-22 11:30; both were cleaned up. |
| 2026-04-18T13:51:06.573Z | canceled | TEST Codex Demo 202604181330 | 2026-10-20 12:00 | conv_codex_live_exec_retry_1776519022157 | 2026-10-20 12:00 |  | Canceled the remaining treatment reservation from the initial live retry. |
| 2026-04-18T13:52:29.507Z | canceled | TEST Codex Verify 202604181338 | 2026-10-22 11:30 | conv_codex_live_exec_verify_1776519511348 | 2026-10-22 11:30 |  | Canceled in Apotool via automated cleanup after partial TC-only booking. |
| 2026-04-18T13:53:56.837Z | booked | TEST Codex Final 202604181352 | 2026-10-20 11:30 | conv_codex_live_exec_final_1776520369674 | 2026-10-20 11:30 | 2026-04-18T13-53-56-830Z-conv_codex_live_exec_final_1776520369674-execute | Final verified live run. Confirmed two reservations were created: 2026-10-20 11:30 T/S and 2026-10-20 12:00 initial. |
| 2026-04-18T13:57:56.372Z | canceled | TEST Codex Final 202604181352 | 2026-10-20 11:30 | conv_codex_live_exec_final_1776520369674 | 2026-10-20 11:30 |  | Final verified demo booking fully cleaned up after canceling both reservations. |
| 2026-04-18T14:01:18.357Z | canceled | TEST Codex Demo 202604181330 | 2026-10-22 11:30 | conv_codex_live_exec_retry_1776519022157 | 2026-10-22 11:30 |  | Canceled in Apotool via automated cleanup for stray TC reservation discovered on 2026-10-22. |
