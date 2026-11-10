const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const tabToPath: Record<string, string> = {
  summary: "resumo",
  checkpoints: "checkpoints",
  observations: "passagens",
  recovery: "recuperacao",
  audit: "historico",
  settings: "configuracao",
  more: "mais",
};

const pathToTab: Record<string, string> = {
  resumo: "summary",
  checkpoints: "checkpoints",
  percurso: "checkpoints",
  passagens: "observations",
  recuperacao: "recovery",
  historico: "audit",
  configuracao: "settings",
  mais: "more",
};

export type AdminPath =
  | { kind: "list" }
  | { kind: "create" }
  | {
      kind: "event";
      eventId: string;
      slug: string;
      tab: string;
      editEvent: boolean;
      checkpointId: string | "new" | null;
      checkpointAction: "edit" | "access" | null;
    };

export function slugifyEventName(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "evento";
}

export function parseAdminPath(pathname: string): AdminPath {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return { kind: "list" };
  if (parts[0] !== "eventos") return { kind: "list" };
  if (parts[1] === "novo") return { kind: "create" };

  let slug = "evento";
  let eventId = "";
  let rest: string[] = [];

  if (parts[1] && UUID.test(parts[1])) {
    eventId = parts[1];
    rest = parts.slice(2);
  } else if (parts[2] && UUID.test(parts[2])) {
    slug = parts[1] || "evento";
    eventId = parts[2];
    rest = parts.slice(3);
  } else {
    return { kind: "list" };
  }

  const tabSeg = rest[0] ?? "resumo";
  const tab = pathToTab[tabSeg] ?? "summary";
  let editEvent = false;
  let checkpointId: string | "new" | null = null;
  let checkpointAction: "edit" | "access" | null = null;

  if (tab === "settings" && rest[1] === "editar") editEvent = true;

  if (tab === "checkpoints") {
    if (rest[1] === "novo") {
      checkpointId = "new";
      checkpointAction = "edit";
    } else if (rest[1] && UUID.test(rest[1])) {
      checkpointId = rest[1];
      if (rest[2] === "editar") checkpointAction = "edit";
      else if (rest[2] === "acessos") checkpointAction = "access";
      else checkpointAction = "edit";
    }
  }

  return { kind: "event", eventId, slug, tab, editEvent, checkpointId, checkpointAction };
}

export function buildAdminPath(
  route:
    | { kind: "list" }
    | { kind: "create" }
    | {
        kind: "event";
        eventId: string;
        name: string;
        tab?: string;
        editEvent?: boolean;
        checkpointId?: string | "new" | null;
        checkpointAction?: "edit" | "access" | null;
      },
): string {
  if (route.kind === "list") return "/eventos";
  if (route.kind === "create") return "/eventos/novo";

  const slug = slugifyEventName(route.name);
  const tab = tabToPath[route.tab ?? "summary"] ?? "resumo";
  let path = `/eventos/${slug}/${route.eventId}/${tab}`;

  if (route.editEvent && tab === "configuracao") path += "/editar";

  if (tab === "checkpoints" && route.checkpointId) {
    if (route.checkpointId === "new") path += "/novo";
    else {
      path += `/${route.checkpointId}`;
      if (route.checkpointAction === "access") path += "/acessos";
      else path += "/editar";
    }
  }

  return path;
}

export function syncAdminPath(path: string, mode: "push" | "replace" = "push") {
  if (location.pathname === path) return;
  if (mode === "replace") history.replaceState(null, "", path);
  else history.pushState(null, "", path);
}
