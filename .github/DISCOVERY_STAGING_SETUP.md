# Isolated discovery staging setup

This procedure is for PR #57 only. It must not modify production environment variables, production Neon, the external cron, or the production worker schedule.

## Isolation already configured

- Neon project: `misty-resonance-47081468`
- Isolated Neon branch: `discovery-supply-readiness-110`
- Branch ID: `br-young-brook-zabahobl`
- Parent: the project's `main` branch
- Vercel project: `site-rescue-studio`
- A branch-scoped encrypted `DATABASE_URL` Preview override exists for `fix/discovery-supply-readiness-110-v2`. It points to the isolated Neon branch, not production.
- The manual workflow is `.github/workflows/discovery-staging.yml`.

The staging branch is a snapshot and will not automatically receive later production records. Treat it as a test copy. Its existing prospects and queue records are seeded snapshot data; staging tests must not trigger real scans or outreach.

## One-time secret setup (manual)

The hosting and repository secret stores must receive the same independently generated staging-only secret. Do not copy or reuse the production `CRON_SECRET` or external cron secret.

1. On the user's local computer, generate a random value in PowerShell with Node.js:

   ```powershell
   node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))"
   ```

2. Copy that value temporarily.
3. In GitHub, open **Settings → Secrets and variables → Actions → New repository secret**:
   - Name: `SRS_STAGING_CRON_SECRET`
   - Value: the newly generated value.
4. In Vercel, open **site-rescue-studio → Settings → Environment Variables** and add:
   - Key: `CRON_SECRET`
   - Value: the same staging-only value
   - Environment: **Preview only**
   - Git branch: `fix/discovery-supply-readiness-110-v2`
   - Comment: isolated discovery staging only; never production.
5. Do not add this value to Production or Development, do not paste it into chat, source files, workflow YAML, issue comments or logs.
6. Redeploy the latest feature-branch preview after adding the variable. Environment changes do not retroactively alter an already-created deployment.

## Run an isolated preparation test

1. Confirm the latest Vercel deployment for `fix/discovery-supply-readiness-110-v2` is **READY**.
2. Confirm its branch-scoped `DATABASE_URL` Preview override still points to Neon branch `discovery-supply-readiness-110`.
3. In GitHub, open **Actions → Site Rescue Studio Isolated Discovery Staging → Run workflow**.
4. Set `preview_url` to the exact READY preview alias for the feature branch. It must be a `site-rescue-studio-*.vercel.app` URL, not `site-rescue-studio.vercel.app`.
5. Set `confirm_isolated` to true only after checking the Neon branch and Vercel environment scope above.
6. Inspect the JSON and job summary. Confirm the endpoint response includes `preparationOnly: true`, and review provider requests, rejection reasons, new unique candidates, qualified prospects and queue depth.

The workflow only calls `/api/automation/run?mode=prepare` on the supplied preview host. It never calls the production hostname. It does not invoke scan workers or send outreach.

## Acceptance criteria

- First verify the preview's DB connection is the isolated Neon branch.
- No production Neon table, provider budget, external cron or production worker schedule may change.
- A test pass is not proof of daily supply. Measure new unique eligible websites, business identity, locality evidence, active non-parked website status and duplicates.
- Keep PR #57 in draft until the source qualification and actual daily 60-new-qualified / 110-reserve targets are demonstrated with staging evidence and a controlled production rollout plan.
