# Free external scheduler setup

This is a manual one-time setup for the protected external trigger. It does not require a paid plan.

## Architecture

cron-job.org sends a short GET request to the Vercel trigger. The trigger validates a separate shared secret and the SAST time window, then uses a GitHub fine-grained token to dispatch the existing `.github/workflows/automation-worker.yml` workflow for one specific batch. The GitHub job performs the existing authenticated call to `/api/automation/run?batch=N`. The trigger does not perform scans itself, so cron-job.org's default 30-second HTTP timeout does not have to cover a scan.

## Required secrets

Configure these in Vercel Project Settings → Environment Variables for **Production**:

- `EXTERNAL_TRIGGER_SECRET`: a new, high-entropy secret used only by cron-job.org to authenticate to `/api/automation/trigger`.
- `GITHUB_DISPATCH_TOKEN`: a GitHub fine-grained personal access token limited to this repository, with Actions: Read and write permission. Use an expiry and rotate it before expiry.

Keep the existing `CRON_SECRET` unchanged. It remains the secret used by the worker to authenticate to the production automation endpoint. Never put any secret in a URL, repository file, issue, or chat message.

After setting the environment variables, redeploy Production so the function receives them.

## cron-job.org configuration

Create 12 jobs in the free account. The default 100 executions/day is sufficient for 12 calls/day. For every job:

- Request method: GET
- URL: `https://site-rescue-studio.vercel.app/api/automation/trigger?batch=N`
- Add custom HTTP header `Authorization` with value `Bearer <EXTERNAL_TRIGGER_SECRET>`
- Enable execution-failure notifications.
- Save responses/history while testing.
- Leave request timeout at the default; the trigger should return after GitHub accepts the dispatch, not after scans finish.

Set the schedule timezone to `Africa/Johannesburg`, every day, and create these exact individual schedules:

| Batch | Hour | Minute |
|---:|---:|---:|
| 1 | 03 | 05 |
| 2 | 03 | 25 |
| 3 | 03 | 45 |
| 4 | 04 | 05 |
| 5 | 04 | 25 |
| 6 | 04 | 45 |
| 7 | 05 | 05 |
| 8 | 05 | 25 |
| 9 | 05 | 45 |
| 10 | 06 | 05 |
| 11 | 06 | 25 |
| 12 | 06 | 45 |

Use one hour/minute pair per job. Do not combine the hours and minutes arrays across jobs, because that creates unintended hour/minute combinations.

## Safe validation sequence

1. Deploy the branch only after its tests pass and the PR is reviewed.
2. Visit the trigger's `?batch=1&dryRun=1` endpoint with the Authorization header using cron-job.org's test feature. Expected response: HTTP 200, `dryRun:true`, `workflowDispatched:false`. A dry run must never dispatch production.
3. Outside the safe start window (before 03:00 or at/after 07:25 SAST), verify a normal request is refused and does not dispatch a workflow. Do not test this by removing the secret.
4. During a permitted production window, enable only one batch job initially and confirm a GitHub workflow_dispatch run starts for the intended batch. This is a real production batch; check Neon for its run record and persisted scan results before enabling the remaining 11 jobs.
5. Only after the controlled batch succeeds should the remaining 11 jobs be enabled. Monitor cron-job.org history, GitHub Actions runs, and Neon together.

## Important limitations

The trigger can confirm that GitHub accepted a workflow dispatch (HTTP 204); that is not proof that the workflow completed or scans were persisted. A daily run is only proven successful when the GitHub worker completes and the corresponding Neon run/scan records are present. GitHub can still queue manually dispatched workflows, so monitor actual start times. The existing API cutoff and queue/database safeguards remain the final controls.
