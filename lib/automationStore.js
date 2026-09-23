async function getDiscoveryStageState(sql) {
  const rows = await sql`SELECT stage_id FROM automation_discovery_stage_state WHERE id = 1 LIMIT 1`;
  if (rows.length) return rows[0].stage_id;
  await sql`INSERT INTO automation_discovery_stage_state (id, stage_id) VALUES (1, 'pretoria_centurion') ON CONFLICT (id) DO NOTHING`;
  return "pretoria_centurion";
}
async function setDiscoveryStageState(sql, stageId) {
  await sql`INSERT INTO automation_discovery_stage_state (id, stage_id, updated_at)
    VALUES (1, ${stageId}, NOW())
    ON CONFLICT (id) DO UPDATE SET stage_id = EXCLUDED.stage_id, updated_at = NOW()`;
}
async function addDiscoveryBacklogCandidates(sql, candidates, source, stageId) {
  let added = 0;
  for (const candidate of candidates || []) {
    const normalized = normalizeProspectWebsite(candidate.website);
    if (!normalized) continue;
    const rows = await sql`INSERT INTO automation_discovery_backlog
      (website, website_normalized, source, region, category, business_name, city)
      VALUES (${candidate.website}, ${normalized}, ${source}, ${stageId || null}, ${candidate.category || null}, ${candidate.name || null}, ${candidate.city || null})
      ON CONFLICT (website_normalized) DO NOTHING RETURNING id`;
    if (rows.length) added++;
  }
  return added;
}
async function drainDiscoveryBacklog(sql, limit = 40) {
  const rows = await sql`SELECT id, website FROM automation_discovery_backlog
    WHERE status = 'available' ORDER BY id ASC LIMIT ${Math.max(1, Math.min(Number(limit) || 40, 40))}`;
  const results = [];
  for (const row of rows) {
    const existing = await sql`SELECT id FROM automation_queue WHERE website_normalized = ${normalizeProspectWebsite(row.website)}
      AND status IN ('queued','running') LIMIT 1`;
    if (existing.length) continue;
    results.push(row.website);
    await sql`UPDATE automation_discovery_backlog SET status = 'queued', queued_at = NOW() WHERE id = ${row.id}`;
  }
  return results;
}
async function getQueueDepth(sql) {
  const rows = await sql`SELECT COUNT(*)::int AS count
    FROM automation_queue
    WHERE status = 'queued' AND attempt_count < 3
      AND (scheduled_for IS NULL OR scheduled_for <= NOW())`;
  return Number(rows[0]?.count || 0);
}