import type { FastifyInstance } from "fastify";
import { equal } from "./security.js";
export function installOperations(app: FastifyInstance, secret?: string) {
  const buckets = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
  const stats = new Map<
    string,
    { route: string; status: number; count: number; sum: number; buckets: number[] }
  >();
  app.addHook("onRequest", async (req, reply) => {
    reply.header("X-Request-ID", req.id);
  });
  app.addHook("onResponse", async (req, reply) => {
    const route = req.routeOptions.url ?? "unmatched";
    if (route === "/api/v1/operations/metrics") return;
    const status = reply.statusCode,
      key = route + ":" + status;
    const row = stats.get(key) ?? {
      route,
      status,
      count: 0,
      sum: 0,
      buckets: buckets.map(() => 0),
    };
    row.count++;
    row.sum += reply.elapsedTime;
    buckets.forEach((b, i) => {
      if (reply.elapsedTime <= b) row.buckets[i] = (row.buckets[i] ?? 0) + 1;
    });
    stats.set(key, row);
    req.log.info(
      { route, method: req.method, status, duration_ms: reply.elapsedTime },
      "request.completed",
    );
  });
  app.get("/api/v1/operations/metrics", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    if (!secret || !equal(req.headers.authorization ?? "", "Bearer " + secret))
      return reply.code(404).send({ error: "Not found" });
    const lines = [
      "# TYPE tempogo_http_requests_total counter",
      "# TYPE tempogo_http_duration_ms histogram",
    ];
    for (const row of stats.values()) {
      const labels = 'route="' + row.route + '",status="' + row.status + '"';
      lines.push(`tempogo_http_requests_total{${labels}} ${row.count}`);
      buckets.forEach((b, i) =>
        lines.push(`tempogo_http_duration_ms_bucket{${labels},le="${b}"} ${row.buckets[i]}`),
      );
      lines.push(
        `tempogo_http_duration_ms_bucket{${labels},le="+Inf"} ${row.count}`,
        `tempogo_http_duration_ms_sum{${labels}} ${row.sum}`,
        `tempogo_http_duration_ms_count{${labels}} ${row.count}`,
      );
    }
    lines.push(
      "# TYPE tempogo_process_uptime_seconds gauge",
      `tempogo_process_uptime_seconds ${process.uptime()}`,
      "# TYPE tempogo_process_rss_bytes gauge",
      `tempogo_process_rss_bytes ${process.memoryUsage().rss}`,
    );
    return reply.type("text/plain; version=0.0.4").send(lines.join("\n") + "\n");
  });
}
