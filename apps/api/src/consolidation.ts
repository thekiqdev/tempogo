// Build groups before filtering/paging: each group spans at most five seconds
// from its earliest effective capture, rather than chaining adjacent detections.
export function consolidatedView(effective: string) {
  return `WITH RECURSIVE ranked AS MATERIALIZED (
    SELECT v.*,dense_rank() OVER(ORDER BY checkpoint_id,effective_bib,source,disposition) partition_id,
      row_number() OVER(PARTITION BY checkpoint_id,effective_bib,source,disposition ORDER BY effective_captured_at,received_at,id) n
    FROM (${effective}) v WHERE organization_id=$1 AND event_id=$2
  ), grouped AS (
    SELECT partition_id,n,id anchor_id,effective_captured_at anchor_time FROM ranked WHERE n=1
    UNION ALL
    SELECT r.partition_id,r.n,
      CASE WHEN r.disposition='invalidated' OR r.effective_captured_at>g.anchor_time+interval '5 seconds' THEN r.id ELSE g.anchor_id END,
      CASE WHEN r.disposition='invalidated' OR r.effective_captured_at>g.anchor_time+interval '5 seconds' THEN r.effective_captured_at ELSE g.anchor_time END
    FROM grouped g JOIN ranked r ON r.partition_id=g.partition_id AND r.n=g.n+1
  ), evidence AS (
    SELECT g.anchor_id,count(*)::int observation_count,bool_or(r.review_required) review_required,
      jsonb_agg(jsonb_build_object('id',r.id,'operator_name',r.operator_name,'access_label',r.access_label,'credential_id',r.credential_id,'effective_captured_at',r.effective_captured_at,'received_at',r.received_at,'status',r.status,'disposition',r.disposition) ORDER BY r.effective_captured_at,r.received_at,r.id) members
    FROM grouped g JOIN ranked r ON r.partition_id=g.partition_id AND r.n=g.n GROUP BY g.anchor_id
  ) SELECT r.id,r.organization_id,r.event_id,r.bib,r.raw_captured_at,r.estimated_captured_at,r.received_at,r.source,r.checkpoint_id,r.checkpoint_name,r.version,r.effective_bib,r.effective_captured_at,r.disposition,
    CASE WHEN e.review_required THEN 'pending' ELSE r.disposition END status,
    r.possible_duplicate,r.operator_name,r.access_label,r.credential_id,r.device_id,e.observation_count,e.members
    FROM evidence e JOIN ranked r ON r.id=e.anchor_id`;
}
