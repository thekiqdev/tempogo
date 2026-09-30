// Build groups before filtering/paging: each group spans at most ten seconds
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
      CASE WHEN r.disposition='invalidated' OR r.effective_captured_at>g.anchor_time+interval '10 seconds' THEN r.id ELSE g.anchor_id END,
      CASE WHEN r.disposition='invalidated' OR r.effective_captured_at>g.anchor_time+interval '10 seconds' THEN r.effective_captured_at ELSE g.anchor_time END
    FROM grouped g JOIN ranked r ON r.partition_id=g.partition_id AND r.n=g.n+1
  ), evidence AS (
    SELECT g.anchor_id,count(*)::int observation_count,bool_or(r.review_required) review_required,
      jsonb_agg(jsonb_build_object('id',r.id,'operator_name',r.operator_name,'access_label',r.access_label,'credential_id',r.credential_id,'effective_captured_at',r.effective_captured_at,'received_at',r.received_at,'status',r.status,'disposition',r.disposition) ORDER BY r.effective_captured_at,r.received_at,r.id) members
    FROM grouped g JOIN ranked r ON r.partition_id=g.partition_id AND r.n=g.n GROUP BY g.anchor_id
  ), passages AS ( SELECT r.id,r.organization_id,r.event_id,r.bib,r.raw_captured_at,r.estimated_captured_at,r.received_at,r.source,r.checkpoint_id,r.checkpoint_name,r.version,r.effective_bib,r.effective_captured_at,r.disposition,
    CASE WHEN e.review_required THEN 'pending' ELSE r.disposition END status,
    r.possible_duplicate,r.operator_name,r.access_label,r.credential_id,r.device_id,r.chip,e.observation_count,e.members
    FROM evidence e JOIN ranked r ON r.id=e.anchor_id
  ), ordered_laps AS (
    SELECT p.*,e.laps total_laps,e.min_lap_seconds,
      row_number() OVER(PARTITION BY p.checkpoint_id,p.effective_bib,p.source ORDER BY p.effective_captured_at,p.received_at,p.id) lap_order
    FROM passages p JOIN app.events e ON e.organization_id=p.organization_id AND e.id=p.event_id
    WHERE p.disposition<>'invalidated'
  ), lap_sequence AS (
    SELECT id,checkpoint_id,effective_bib,source,lap_order,1 lap_number,effective_captured_at lap_time,false lap_too_soon FROM ordered_laps WHERE lap_order=1
    UNION ALL
    SELECT p.id,p.checkpoint_id,p.effective_bib,p.source,p.lap_order,
      CASE WHEN p.effective_captured_at>=l.lap_time+make_interval(secs=>p.min_lap_seconds) THEN l.lap_number+1 ELSE l.lap_number END,
      CASE WHEN p.effective_captured_at>=l.lap_time+make_interval(secs=>p.min_lap_seconds) THEN p.effective_captured_at ELSE l.lap_time END,
      p.effective_captured_at<l.lap_time+make_interval(secs=>p.min_lap_seconds)
    FROM lap_sequence l JOIN ordered_laps p ON p.checkpoint_id=l.checkpoint_id AND p.effective_bib=l.effective_bib AND p.source=l.source AND p.lap_order=l.lap_order+1
  ) SELECT p.*,l.lap_number,coalesce(l.lap_too_soon,false) lap_too_soon,e.laps total_laps,
      coalesce(l.lap_number>e.laps,false) lap_exceeded
    FROM passages p JOIN app.events e ON e.organization_id=p.organization_id AND e.id=p.event_id LEFT JOIN lap_sequence l ON l.id=p.id`;
}

// Original observations inherit the lap of their group without advancing it again.
export function passageView(effective: string, records: boolean) {
  if (!records) return consolidatedView(effective);
  return `WITH consolidated AS MATERIALIZED (${consolidatedView(effective)})
    SELECT v.*,c.lap_number,c.lap_too_soon,c.total_laps,c.lap_exceeded,1 observation_count,NULL::jsonb members
    FROM consolidated c CROSS JOIN LATERAL jsonb_array_elements(c.members) member
    JOIN (${effective}) v ON v.id=(member->>'id')::uuid
    WHERE v.organization_id=$1 AND v.event_id=$2`;
}
