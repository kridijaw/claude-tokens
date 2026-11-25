# Output corrections

Claude Code 2.1.296, 2.1.300 and 2.1.304 wrote too low an `output_tokens` value on each assistant message in the transcripts, so the ledger undercounts output, and with it cost, for sessions run on those versions. claude-tokens does not detect or fix this itself.

The transcripts also contain `cost-state` records. The last one in a session has the correct total per model in `modelUsage.<model>.outputTokens`. The difference between that total and the sum of the session's per-message `output_tokens` for the same model can be added to the ledger as a correction row in `messages`:

| Column | Value |
|---|---|
| `id` | `cost-state:<session id>:<model>` |
| `at` | a timestamp from the session, which sets the day the correction counts for |
| `cwd` | the session's working directory |
| `model` | the model |
| `input`, `cache_write`, `cache_read` | 0 |
| `output` | the missing output tokens |
| `cache_write_1h`, `thinking` | NULL |

The report prices a correction row like any other row, but leaves it out of the hour-of-day views, because it covers a whole session rather than one hour.
