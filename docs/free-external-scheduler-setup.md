# Free external scheduler — direct GitHub dispatch

## Why this is the correct route

The earlier `external-free-scheduler` branch used `api/automation/trigger.js`, which would add a Vercel Serverless Function. That route was not merged and must not be used because the production deployment is on Vercel Hobby's function limit.

This setup calls GitHub's existing Actions workflow-dispatch API directly. It does **not** add a Vercel function, does not require Vercel environment-variable changes, and leaves the existing production API, scanner, queue, Neon schema, and 07:30 SAST cutoff unchanged.

GitHub's native `schedule` events remain enabled as a fallback. The external schedule is an additional trigger, not a guarantee of punctuality: cron-job.org notes that it cannot guarantee execution times, and GitHub Actions runners can still queue.

## Free service and limits

Use [cron-job.org](https://cron-job.org/). Its published FAQ says the service is free, supports custom headers and POST request bodies, and its default daily execution limit is 100 requests. Twelve dispatches per day are within that default. It also states that timing is not guaranteed; monitor its execution history and GitHub Actions.

## Step 1 — create a narrowly scoped GitHub token

In GitHub, create a **fine-grained personal access token**:
- Resource owner: your account.
- Repository access: **Only select repositories** → `Site-Rescue-Studio`.
- Repository permissions: **Actions: Read and write**. Do not grant Contents write or other permissions.
- Set an expiry and calendar a reminder to rotate it before expiry.

Keep the token private. Do not put it in a URL, repository file, workflow, issue, or chat.

## Step 2 — test the scheduler connection safely

After this document and `.github/workflows/external-scheduler-probe.yml` are merged to `main`, create one temporary cron-job.org job with these settings:

- Request URL: `https://api.github.com/repos/dev-johan-swart/Site-Rescue-Studio/actions/workflows/external-scheduler-probe.yml/dispatches`
- Method: `POST`
- Headers:
  - `Accept: application/vnd.github+json`
  - `Authorization: Bearer YOUR_FINE_GRAINED_TOKEN`
  - `Content-Type: application/json`
  - `X-GitHub-Api-Version: 2022-11-28`
- Body (raw JSON): `{"ref":"main","inputs":{"batch":"1"}}`
- Set timezone to `Africa/Johannesburg`.
- For the first test, do **not** schedule it for the production window and do not click any test button that would dispatch the production worker. You can manually trigger this safe probe at any time.

GitHub's current REST documentation specifies HTTP 200 for a successful workflow dispatch (with the run ID/URL in the response). Treat only a documented successful response as accepted; if the scheduler reports an error, inspect its history before retrying. Then open [the probe workflow runs](https://github.com/dev-johan-swart/Site-Rescue-Studio/actions/workflows/external-scheduler-probe.yml) and confirm a run completes with `SAFE_EXTERNAL_DISPATCH_CONFIRMED`. This probe does not call Vercel or touch Neon.

Once confirmed, disable/delete the temporary probe job. Keep the token available for the production jobs.

## Step 3 — create the 12 production jobs

Create **12 separate jobs**, one per batch. Use the same headers as above, but change the URL and body as follows. Do not use the probe workflow for production.

Production URL for all 12 jobs:

`https://api.github.com/repos/dev-johan-swart/Site-Rescue-Studio/actions/workflows/automation-worker.yml/dispatches`

Method: `POST`

Body for each job: `{"ref":"main","inputs":{"batch":"N"}}`, replacing `N` with that row's batch number.

| Batch | SAST time (Africa/Johannesburg) | Body |
|---:|:---:|---|
| 1 | 03:05 | `{"ref":"main","inputs":{"batch":"1"}}` |
| 2 | 03:25 | `{"ref":"main","inputs":{"batch":"2"}}` |
| 3 | 03:45 | `{"ref":"main","inputs":{"batch":"3"}}` |
| 4 | 04:05 | `{"ref":"main","inputs":{"batch":"4"}}` |
| 5 | 04:25 | `{"ref":"main","inputs":{"batch":"5"}}` |
| 6 | 04:45 | `{"ref":"main","inputs":{"batch":"6"}}` |
| 7 | 05:05 | `{"ref":"main","inputs":{"batch":"7"}}` |
| 8 | 05:25 | `{"ref":"main","inputs":{"batch":"8"}}` |
| 9 | 05:45 | `{"ref":"main","inputs":{"batch":"9"}}` |
| 10 | 06:05 | `{"ref":"main","inputs":{"batch":"10"}}` |
| 11 | 06:25 | `{"ref":"main","inputs":{"batch":"11"}}` |
| 12 | 06:45 | `{"ref":"main","inputs":{"batch":"12"}}` |

For every job:
- Select timezone `Africa/Johannesburg`, every day, at the exact hour and minute in the table.
- Enable failure email notifications.
- Enable saving response/history while validating.
- Keep the request timeout short/default; the GitHub API should accept dispatch quickly and does not wait for scans to finish.

## Step 4 — cautious rollout without duplicate triggers

1. Keep all 12 external production jobs disabled until the safe probe is confirmed.
2. Configure all 12 production jobs in cron-job.org, but leave them disabled and verify each batch number, time, timezone, headers, and request body.
3. **Do not enable a production external job while the native GitHub `schedule` trigger is still active.** Both triggers could invoke the same batch. The worker's claim protection is useful, but we should not rely on duplicate dispatches as a rollout strategy.
4. Once the probe passes and all 12 external jobs are ready, perform a separate reviewed cutover: remove only the native `schedule:` entries from `.github/workflows/automation-worker.yml`, while preserving `workflow_dispatch`, its batch input, the worker steps, and the API cutoff. Merge that surgical change, then enable the 12 external jobs immediately.
5. For the first production day, compare each cron-job.org planned/actual time with GitHub run creation/start time, batch number in logs, and the matching Neon run/scan records. Treat HTTP acceptance alone as insufficient.
6. If the external schedule misses a slot or dispatches late, pause further changes and inspect scheduler history, GitHub run timestamps, and Neon before retrying anything. Do not manually replay a batch until confirming it was not already claimed or completed.

## Safety and limitations

- A successful HTTP 204 means GitHub accepted the dispatch; it does not prove the worker finished or that scans were persisted.
- The worker still calls the existing production endpoint, which enforces its own 07:30 SAST cutoff. A late dispatch must be treated as a missed batch, not as success.
- Do not retry a production batch just because the scheduler's request result is unclear. First inspect the GitHub run and Neon to avoid duplicate work.
- cron-job.org is free but provides no punctuality guarantee. This is a practical way to bypass the native scheduled-event delivery layer, not a guarantee against all scheduling or runner delays.
- Never share the GitHub token or paste it into chat.
