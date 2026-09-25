import { orderedPayload } from "@tempogo/contracts";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { FieldError, request } from "./field-api";
import { boot, clockEvidence, grantValid, retryDelay } from "./field-clock";
import { prepareShell } from "./field-pwa";
import {
  type ClockSample,
  type FieldSession,
  type Intent,
  type Preparation,
  payloadFor,
  readIntents,
  readPreparation,
  saveIntent,
  savePreparation,
} from "./field-store";
import { ReviewRequest } from "./review-request";

type Passage = {
  id: string;
  client_event_id: string;
  bib: string;
  raw_captured_at: string;
  received_at: string;
  possible_duplicate: boolean;
  needs_review?: boolean;
};
type FieldScreen = "capturar" | "registros" | "aparelho";
function currentScreen(): FieldScreen {
  const hash = location.hash.slice(1);
  return hash === "registros" || hash === "aparelho" ? hash : "capturar";
}
export function FieldApp() {
  const [session, setSession] = useState<FieldSession | null>(null),
    [prepared, setPrepared] = useState<Preparation | null>(null),
    [expired, setExpired] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [code, setCode] = useState(""),
    [password, setPassword] = useState(""),
    [showPassword, setShowPassword] = useState(false),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    (async () => {
      const p = await readPreparation().catch(() => null);
      try {
        const s = await request<FieldSession>("/me");
        setSession(s);
        if (p?.session.credential_id === s.credential_id) setPrepared(p);
      } catch (e) {
        if (p) {
          const blocked = Boolean(p.blocked || (e instanceof FieldError && e.status === 401));
          const cached = { ...p, blocked };
          if (blocked) await savePreparation(cached).catch(() => {});
          setPrepared(cached);
          setSession({ ...p.session, csrf_token: "" });
          setExpired(blocked);
        } else if (!(e instanceof FieldError && e.status === 401))
          setError("Entre com conexão para preparar este aparelho.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);
  async function login(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await request("/login", "", { code, password });
      setPassword("");
      const s = await request<FieldSession>("/me");
      const p = await readPreparation();
      if (p && p.session.credential_id !== s.credential_id) {
        const old = await readIntents(
          p.session.session_id,
          p.session.credential_id,
          p.session.previous_session_ids,
        );
        if (old.some((i) => !["synced", "confirmed"].includes(i.status))) {
          const blocked = { ...p, blocked: true };
          await savePreparation(blocked);
          setPrepared(blocked);
          setSession({ ...p.session, csrf_token: "" });
          setExpired(true);
          return;
        }
        await savePreparation(null);
        setPrepared(null);
      }
      setExpired(false);
      setSession(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível entrar");
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <main className="boot">Conectando ao checkpoint…</main>;
  if (session)
    return (
      <Capture
        key={session.session_id}
        session={session}
        preparation={prepared}
        initialExpired={expired}
        onExit={() => {
          setSession(null);
          setPrepared(null);
        }}
        onReauthenticate={() => {
          setSession(null);
          setExpired(false);
        }}
      />
    );
  return (
    <main className="field-login">
      <a href="/">← Administração</a>
      <p className="eyebrow">TempoGo · EQUIPE DE CAMPO</p>
      <h1>Entre no seu checkpoint</h1>
      <p>
        A entrada e a renovação do acesso exigem conexão. Use o mesmo código para recuperar a fila
        deste aparelho.
      </p>
      <form onSubmit={login}>
        <label>
          Código do checkpoint
          <input
            required
            autoComplete="username"
            maxLength={8}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
        </label>
        <label>
          Senha do checkpoint
          <input
            required
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="text-button"
          aria-pressed={showPassword}
          onClick={() => setShowPassword(!showPassword)}
        >
          {showPassword ? "Ocultar senha" : "Mostrar senha"}
        </button>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy}>
          {busy ? "Entrando…" : "Entrar no checkpoint"}
        </button>
      </form>
    </main>
  );
}
function Capture({
  session: initial,
  preparation,
  initialExpired,
  onExit,
  onReauthenticate,
}: {
  session: FieldSession;
  preparation: Preparation | null;
  initialExpired: boolean;
  onExit: () => void;
  onReauthenticate: () => void;
}) {
  const [session, setSession] = useState(initial),
    [prep, setPrep] = useState(preparation),
    [items, setItems] = useState<Intent[]>([]),
    [history, setHistory] = useState<Passage[]>([]);
  const [bib, setBib] = useState(""),
    [error, setError] = useState(
      initialExpired
        ? "Acesso indisponível. Renove o mesmo acesso ou exporte os pendentes para a organização."
        : "",
    ),
    [notice, setNotice] = useState(""),
    [online, setOnline] = useState(navigator.onLine),
    [busy, setBusy] = useState(false),
    [sending, setSending] = useState(false),
    [expired, setExpired] = useState(initialExpired),
    [tick, setTick] = useState(0),
    [exported, setExported] = useState(false);
  const [screen, setScreen] = useState<FieldScreen>(currentScreen),
    [systemKeyboard, setSystemKeyboard] = useState(false),
    [filter, setFilter] = useState("todos"),
    [selected, setSelected] = useState<string | null>(null),
    [lastCapture, setLastCapture] = useState<{ id: string; bib: string } | null>(null),
    [syncError, setSyncError] = useState(""),
    [exportBusy, setExportBusy] = useState(false),
    [packageSaved, setPackageSaved] = useState(false);
  const title = useRef<HTMLHeadingElement>(null);
  const scrollPositions = useRef<Partial<Record<FieldScreen, number>>>({});
  const activeScreen = useRef(screen);
  useEffect(() => {
    const changed = () => {
      scrollPositions.current[activeScreen.current] = window.scrollY;
      activeScreen.current = currentScreen();
      setScreen(activeScreen.current);
    };
    window.addEventListener("hashchange", changed);
    return () => window.removeEventListener("hashchange", changed);
  }, []);
  useEffect(() => {
    title.current?.focus({ preventScroll: true });
    window.scrollTo(0, scrollPositions.current[screen] ?? 0);
  }, [screen]);
  function navigate(next: FieldScreen) {
    if (next !== screen) location.hash = next;
  }
  const scope = useRef(initial),
    preparationRef = useRef(preparation),
    locking = useRef(false),
    draining = useRef(false),
    captureVersion = useRef(0),
    stopped = useRef(false),
    attempt = useRef(0),
    nextAttempt = useRef(0),
    lastPrepare = useRef(-Infinity),
    lastHeartbeat = useRef(0),
    input = useRef<HTMLInputElement>(null);
  async function refresh() {
    const list = await readIntents(
      scope.current.session_id,
      scope.current.credential_id,
      scope.current.previous_session_ids,
    );
    setItems(list);
    return list;
  }
  async function calibrate(s: FieldSession, shell: boolean) {
    if (shell) await prepareShell();
    const samples: ClockSample[] = [];
    for (let n = 0; n < 3; n++) {
      const wall = Date.now(),
        mono = performance.now();
      const r = await request<{ server_time: string }>("/time");
      const end = performance.now();
      samples.push({
        offset_ms: Date.parse(r.server_time) - (wall + (end - mono) / 2),
        rtt_ms: end - mono,
        wall,
        mono,
        measured_at: new Date(wall).toISOString(),
        boot,
      });
    }
    samples.sort((a, b) => a.rtt_ms - b.rtt_ms);
    const clock = samples[0];
    if (!clock) throw new Error("Não foi possível medir o relógio");
    const r = await request<{ grant: Preparation["grant"] }>("/prepare", s.csrf_token, {});
    const { csrf_token: _, ...safe } = s;
    const p: Preparation = { session: safe, grant: r.grant, clock, prepared_wall: Date.now() };
    await savePreparation(p);
    preparationRef.current = p;
    setPrep(p);
    lastPrepare.current = performance.now();
  }
  async function prepare() {
    setBusy(true);
    setError("");
    try {
      const s = await request<FieldSession>("/me");
      if (s.credential_id !== scope.current.credential_id)
        throw new FieldError(
          "Outro acesso está ativo. Renove o mesmo acesso antes de preparar.",
          401,
        );
      scope.current = s;
      setSession(s);
      await calibrate(s, true);
      setNotice("Aparelho preparado para interrupções de conexão");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na preparação");
    } finally {
      setBusy(false);
    }
  }
  async function heartbeat(list: Intent[]) {
    const counts = { pending: 0, sending: 0, synced: 0, blocked: 0 };
    for (const i of list) counts[i.status === "confirmed" ? "synced" : i.status]++;
    await request("/heartbeat", scope.current.csrf_token, counts);
    lastHeartbeat.current = performance.now();
  }
  async function sync(force = false) {
    if (navigator.locks)
      return navigator.locks.request(
        "checkpoint-sync:" + scope.current.credential_id,
        { ifAvailable: true },
        async (lock) => {
          if (lock) await syncUnlocked(force);
        },
      );
    return syncUnlocked(force);
  }
  async function syncUnlocked(force = false) {
    if (
      draining.current ||
      stopped.current ||
      !navigator.onLine ||
      (!force && performance.now() < nextAttempt.current)
    )
      return;
    draining.current = true;
    const versionAtStart = captureVersion.current;
    setSending(true);
    try {
      // Revalidate before any upload, including every reconnection.
      const s = await request<FieldSession>("/me");
      if (s.credential_id !== scope.current.credential_id)
        throw new FieldError("Outro acesso está ativo nesta janela. Reabra o acesso correto.", 401);
      scope.current = s;
      setSession(s);
      setExpired(false);
      if (preparationRef.current && s.state !== "running") {
        const p = {
          ...preparationRef.current,
          session: { ...preparationRef.current.session, state: s.state },
        };
        await savePreparation(p);
        preparationRef.current = p;
        setPrep(p);
      }
      if (
        preparationRef.current &&
        s.state === "running" &&
        performance.now() - lastPrepare.current > 60000
      )
        await calibrate(s, false);
      const list = await refresh();
      for (const item of list.filter((i) => i.status === "pending" || i.status === "sending")) {
        if (!navigator.onLine) break;
        await saveIntent({ ...item, status: "sending" });
        try {
          const result = await request<Passage>("/sync", s.csrf_token, payloadFor(item));
          await saveIntent({
            ...item,
            status: "synced",
            remote_id: result.id,
            needs_review: result.needs_review,
            message: undefined,
          });
        } catch (e) {
          if (e instanceof FieldError && [400, 403, 409, 422].includes(e.status)) {
            await saveIntent({ ...item, status: "blocked", message: e.message });
            continue;
          }
          await saveIntent({ ...item, status: "pending" });
          throw e;
        }
      }
      const listAfter = await refresh();
      if (performance.now() - lastHeartbeat.current > 60000 || force) await heartbeat(listAfter);
      const h = await request<{ items: Passage[] }>("/observations");
      setHistory(h.items);
      setSyncError("");
      attempt.current = 0;
      nextAttempt.current =
        performance.now() +
        (captureVersion.current !== versionAtStart || listAfter.some((i) => i.status === "pending")
          ? 1000
          : 15000);
    } catch (e) {
      if (e instanceof FieldError && e.status === 401) {
        setExpired(true);
        stopped.current = true;
        if (preparationRef.current) {
          const p = { ...preparationRef.current, blocked: true };
          preparationRef.current = p;
          setPrep(p);
          await savePreparation(p).catch(() => {});
        }
        setError(
          "Acesso expirado ou revogado. Fila preservada. Renove o mesmo acesso ou exporte para recuperação administrativa.",
        );
      } else {
        nextAttempt.current = performance.now() + retryDelay(attempt.current++);
        setSyncError(
          "Envio não confirmado. Fila preservada; nova tentativa automática com conexão.",
        );
      }
      await refresh().catch(() =>
        setError("Armazenamento indisponível. Não limpe os dados deste navegador."),
      );
    } finally {
      draining.current = false;
      setSending(false);
    }
  }
  useEffect(() => {
    let live = true;
    stopped.current = initialExpired;
    (async () => {
      const list = await refresh();
      for (const i of list)
        if (i.status === "sending") await saveIntent({ ...i, status: "pending" });
      if (live) void sync(true);
    })().catch(() =>
      setError("Não foi possível abrir a fila local. Não limpe os dados do navegador."),
    );
    const on = () => {
        setOnline(true);
        nextAttempt.current = 0;
        void sync(true);
      },
      off = () => setOnline(false),
      focus = () => {
        void sync(true);
      };
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    window.addEventListener("focus", focus);
    const timer = setInterval(() => {
      setTick((v) => v + 1);
      if (!draining.current && navigator.onLine) void sync();
    }, 1000);
    return () => {
      live = false;
      clearInterval(timer);
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      window.removeEventListener("focus", focus);
    };
  }, []);
  const valid = prep ? grantValid(prep) : online;
  const enabled = !busy && !expired && session.state === "running" && valid;
  async function capture(e: FormEvent) {
    e.preventDefault();
    if (locking.current) return;
    if (!/^[0-9]{1,8}$/.test(bib)) {
      setError("Digite de 1 a 8 dígitos, sem letras.");
      return;
    }
    const p = preparationRef.current;
    if (expired || scope.current.state !== "running" || (p ? !grantValid(p) : !navigator.onLine)) {
      setError("Concessão indisponível ou expirada. Reconecte e prepare o aparelho.");
      return;
    }
    locking.current = true;
    setBusy(true);
    setError("");
    const raw = new Date().toISOString(),
      id = crypto.randomUUID();
    const item: Intent = {
      client_event_id: id,
      bib,
      raw_captured_at: raw,
      session_id: scope.current.session_id,
      credential_id: scope.current.credential_id,
      status: "pending",
      payload: {
        client_event_id: id,
        bib,
        raw_captured_at: raw,
        capture_session_id: scope.current.session_id,
        ...(p && p.session.session_id === scope.current.session_id
          ? { grant_id: p.grant.id, clock: clockEvidence(p.clock) }
          : {}),
      },
    };
    try {
      await saveIntent(item);
      captureVersion.current++;
      setBib("");
      setExported(false);
      setPackageSaved(false);
      setLastCapture({ id, bib: item.bib });
      setNotice("");
      setItems((v) => [...v, item]);
      nextAttempt.current = 0;
      void sync();
    } catch {
      setError(
        "Não foi possível salvar no aparelho. O número continua no visor; não considere registrado.",
      );
    } finally {
      locking.current = false;
      setBusy(false);
      if (systemKeyboard) input.current?.focus();
    }
  }
  const pending = items.filter((i) => !["synced", "confirmed"].includes(i.status));
  async function exportRecovery() {
    setExportBusy(true);
    setPackageSaved(false);
    setError("");
    try {
      const list = await refresh(),
        records = [];
      for (const i of list.filter((i) => !["synced", "confirmed"].includes(i.status))) {
        const payload = orderedPayload(payloadFor(i));
        const hash = await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(JSON.stringify(payload)),
        );
        records.push({
          payload,
          sha256: Array.from(new Uint8Array(hash))
            .map((n) => n.toString(16).padStart(2, "0"))
            .join(""),
        });
      }
      if (!records.length) {
        setError("Nenhum registro pendente para exportar");
        return;
      }
      const text = JSON.stringify(
        {
          version: 1,
          event_id: session.event_id,
          checkpoint_id: session.checkpoint_id,
          items: records,
        },
        null,
        2,
      );
      const url = URL.createObjectURL(new Blob([text], { type: "application/json" })),
        a = document.createElement("a");
      a.href = url;
      a.download = "recuperacao-" + session.checkpoint_id + ".json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setExported(true);
      setNotice(
        "Download solicitado. Confirme que guardou o arquivo. A fila permanece neste aparelho.",
      );
    } catch {
      setError("Não foi possível exportar. Preserve este navegador e contate a organização.");
    } finally {
      setExportBusy(false);
    }
  }
  async function logout() {
    try {
      if ((await refresh()).some((i) => !["synced", "confirmed"].includes(i.status))) {
        setError("Há registros pendentes. Exporte a recuperação ou sincronize antes de sair.");
        return;
      }
      await request("/logout", scope.current.csrf_token, {});
      await savePreparation(null);
      onExit();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao sair");
    }
  }
  const uncertain = prep ? clockEvidence(prep.clock).uncertain : true;
  const blockedReason = expired
    ? "Acesso bloqueado. Renove o mesmo acesso ou exporte a fila."
    : session.state !== "running"
      ? "Captura pausada. Aguarde a liberação da organização."
      : !valid
        ? "Captura indisponível. Reconecte e prepare o aparelho."
        : "";
  const remoteIds = new Set(history.map((item) => item.client_event_id));
  const records = [
    ...items
      .filter((item) => !remoteIds.has(item.client_event_id))
      .map((item) => ({
        key: item.client_event_id,
        bib: item.bib,
        time: item.raw_captured_at,
        status: item.status,
        remoteId: item.remote_id,
        review: item.needs_review,
        duplicate: false,
        message: item.message,
      })),
    ...history.map((item) => ({
      key: item.client_event_id,
      bib: item.bib,
      time: item.raw_captured_at,
      status: "synced",
      remoteId: item.id,
      review: item.needs_review,
      duplicate: item.possible_duplicate,
      message: undefined,
    })),
  ].sort((a, b) => b.time.localeCompare(a.time));
  const isConfirmed = (status: string) => status === "synced" || status === "confirmed";
  const filtered = records.filter(
    (item) =>
      filter === "todos" ||
      (filter === "pendentes"
        ? !isConfirmed(item.status)
        : item.status === "blocked" || item.review || item.duplicate),
  );
  const detail = records.find((item) => item.key === selected);
  const last = lastCapture && records.find((item) => item.key === lastCapture.id);
  const captureFeedback = lastCapture
    ? last && isConfirmed(last.status)
      ? lastCapture.bib + " confirmado no servidor"
      : last?.status === "blocked"
        ? lastCapture.bib + " salvo no aparelho · requer atenção"
        : lastCapture.bib + " salvo no aparelho · aguardando servidor"
    : "Digite o número e toque em Registrar.";
  function keypress(key: string) {
    if (busy) return;
    if (/^[0-9]$/.test(key) && bib.length >= 8) {
      setError("Limite de 8 dígitos.");
      return;
    }
    setError("");
    setBib((value) =>
      key === "Limpar" ? "" : key === "Apagar" ? value.slice(0, -1) : value + key,
    );
  }
  void tick;
  return (
    <main className="field-app" data-screen={screen}>
      <header className="operator-header">
        <div>
          <p className="operator-brand">TempoGo</p>
          <h1>{session.checkpoint_name}</h1>
          <p title={session.event_name}>{session.event_name}</p>
        </div>
        <button
          className="operator-context"
          onClick={() => navigate("aparelho")}
          aria-label="Ver aparelho e acesso"
        >
          Aparelho
        </button>
      </header>
      <div className="operator-status">
        <span>{online ? (sending ? "Enviando…" : "Rede disponível") : "Sem conexão"}</span>
        <button onClick={() => navigate("registros")}>{pending.length} pendente(s)</button>
      </div>
      {blockedReason && (
        <div className="operator-warning" role="status">
          {blockedReason}
          <button onClick={() => navigate("aparelho")}>Ver aparelho</button>
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {syncError && (
        <p className="operator-warning" role="status">
          {syncError}
        </p>
      )}
      {notice && (
        <p className="success" role="status">
          {notice}
        </p>
      )}
      <h2 className="screen-reader-only" ref={title} tabIndex={-1}>
        {screen === "capturar" ? "Capturar" : screen === "registros" ? "Registros" : "Aparelho"}
      </h2>
      <section
        className="operator-capture"
        hidden={screen !== "capturar"}
        aria-label="Capturar passagem"
      >
        <form onSubmit={capture}>
          <div className="entry-tools">
            <label htmlFor="operator-bib">Número de peito</label>
            <button
              type="button"
              className="keyboard-switch"
              aria-pressed={systemKeyboard}
              onClick={() => {
                setSystemKeyboard(!systemKeyboard);
              }}
            >
              {systemKeyboard ? "Usar teclado da tela" : "Usar teclado do aparelho"}
            </button>
          </div>
          <input
            id="operator-bib"
            ref={input}
            className="bib-display"
            aria-label="Número de peito"
            inputMode={systemKeyboard ? "numeric" : "none"}
            readOnly={!systemKeyboard}
            autoComplete="off"
            maxLength={8}
            value={bib}
            placeholder="—"
            onChange={(e) => {
              if (/^[0-9]{0,8}$/.test(e.target.value)) {
                setBib(e.target.value);
                setError("");
              } else setError("Use somente números, até 8 dígitos.");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.repeat) e.preventDefault();
              if (!systemKeyboard && !e.ctrlKey && !e.metaKey && !e.altKey) {
                if (/^[0-9]$/.test(e.key)) {
                  e.preventDefault();
                  keypress(e.key);
                }
                if (e.key === "Backspace" || e.key === "Delete") {
                  e.preventDefault();
                  keypress(e.key === "Delete" ? "Limpar" : "Apagar");
                }
              }
            }}
            disabled={busy}
          />
          {!systemKeyboard && (
            <div className="keypad" aria-label="Teclado numérico">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "Limpar", "0", "Apagar"].map((key) => (
                <button type="button" key={key} disabled={busy} onClick={() => keypress(key)}>
                  {key}
                </button>
              ))}
            </div>
          )}
          <button className="primary register" disabled={!enabled || !/^[0-9]{1,8}$/.test(bib)}>
            {busy ? "Salvando…" : "Registrar passagem ↵"}
          </button>
        </form>
        <p className="capture-feedback" role="status" aria-live="polite">
          {captureFeedback}
        </p>
        <p className="capture-readiness">
          {prep && valid
            ? uncertain
              ? "Preparado · horário sujeito a revisão"
              : "Preparado para interrupções"
            : "Prepare o aparelho para capturar sem conexão"}
        </p>
      </section>
      <section
        className="operator-panel"
        hidden={screen !== "registros"}
        aria-label="Registros deste acesso"
      >
        <div className="section-title">
          <h2>Registros deste acesso</h2>
          <button
            className="secondary"
            disabled={sending || !online || expired}
            onClick={() => sync(true)}
          >
            {sending ? "Enviando…" : "Reenviar pendentes"}
          </button>
        </div>
        <p>
          {pending.length} pendente(s) no aparelho ·{" "}
          {items.filter((item) => isConfirmed(item.status)).length} confirmado(s) locais
        </p>
        <div className="record-filters" aria-label="Filtrar registros">
          {[
            ["todos", "Todos"],
            ["pendentes", "Pendentes"],
            ["atencao", "Atenção"],
          ].map(([value, label]) => (
            <button
              key={value}
              className="secondary"
              aria-pressed={filter === value}
              onClick={() => {
                setFilter(value ?? "todos");
                setSelected(null);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <ul className="passage-list operator-records">
          {filtered.slice(0, 100).map((item) => (
            <li key={item.key}>
              <button
                className="record-open"
                aria-expanded={selected === item.key}
                onClick={() => setSelected(selected === item.key ? null : item.key)}
              >
                <strong>{item.bib}</strong>
                <span>
                  <span className={isConfirmed(item.status) ? "confirmed-label" : "pending-label"}>
                    {isConfirmed(item.status)
                      ? "Confirmado no servidor"
                      : "Salvo no aparelho · " +
                        (item.status === "blocked"
                          ? "requer atenção"
                          : item.status === "sending"
                            ? "enviando"
                            : "aguardando servidor")}
                  </span>
                  <small>
                    {new Date(item.time).toLocaleTimeString()} · horário do aparelho
                    {item.review || item.duplicate ? " · requer revisão" : ""}
                  </small>
                </span>
                <span aria-hidden="true">{selected === item.key ? "−" : "+"}</span>
              </button>
              {detail?.key === item.key && (
                <div className="record-detail">
                  <p>
                    {item.message ?? "Confira o número e o horário antes de solicitar revisão."}
                  </p>
                  {item.remoteId ? (
                    <ReviewRequest
                      id={item.remoteId}
                      csrf={expired ? "" : scope.current.csrf_token}
                    />
                  ) : (
                    <p>A revisão estará disponível após o recebimento pelo servidor.</p>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
        {!filtered.length && (
          <p className="operator-empty">
            {filter === "todos"
              ? "Nenhum registro neste acesso ainda."
              : "Nenhum registro neste filtro."}
          </p>
        )}
        <p className="footnote">
          Exibindo até 100 registros deste filtro. A consulta ao servidor traz os 100 mais recentes;
          a exportação inclui todos os pendentes locais.
        </p>
      </section>
      <section
        className="operator-panel"
        hidden={screen !== "aparelho"}
        aria-label="Aparelho e recuperação"
      >
        <h2>Seu aparelho</h2>
        <p className="device-event-name">{session.event_name}</p>
        <p>
          {session.label} · {session.checkpoint_name}
        </p>
        <section className="device-section">
          <h3>Preparação para a corrida</h3>
          <dl className="device-checks">
            <div>
              <dt>Acesso</dt>
              <dd>
                {expired
                  ? "Bloqueado — renove o mesmo acesso"
                  : "Válido até " + new Date(session.expires_at).toLocaleString("pt-BR")}
              </dd>
            </div>
            <div>
              <dt>Captura</dt>
              <dd>
                {session.state === "running"
                  ? online
                    ? "Corrida em andamento"
                    : "Última situação: em andamento"
                  : "Pausada"}
              </dd>
            </div>
            <div>
              <dt>Offline e armazenamento</dt>
              <dd>
                {prep && valid ? "Preparado para interrupções" : "Preparação offline necessária"}
                {prep && " · concessão até " + new Date(prep.grant.expires_at).toLocaleTimeString()}
              </dd>
            </div>
            <div>
              <dt>Relógio</dt>
              <dd>{uncertain ? "Horário incerto: sujeito a revisão" : "Referência recente"}</dd>
            </div>
          </dl>
          <button className="primary" disabled={busy || !online || expired} onClick={prepare}>
            {busy ? "Preparando…" : "Preparar aparelho"}
          </button>
          <p className="footnote">
            Prepare com conexão antes de operar. Mantenha a tela aberta para sincronizar. Rede
            disponível não significa recebimento pelo servidor.
          </p>
        </section>
        <section className="device-section">
          <h3>Sincronização e recuperação</h3>
          <p>
            {pending.length} pendente(s). Salvo no aparelho não significa recebido pelo servidor.
          </p>
          <div className="device-actions">
            <button
              className="secondary"
              disabled={sending || !online || expired}
              onClick={() => sync(true)}
            >
              Atualizar situação da corrida e registros
            </button>
            <button
              className="secondary"
              disabled={exportBusy || busy || !pending.length}
              onClick={exportRecovery}
            >
              {exportBusy ? "Gerando pacote…" : "Exportar recuperação"}
            </button>
          </div>
          <p className="footnote">
            Não limpe os dados do navegador. O pacote inclui todos os pendentes e deve ser entregue
            à organização para revisão.
          </p>
          {exported && (
            <div className="recovery-confirm">
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={packageSaved}
                  onChange={(e) => setPackageSaved(e.target.checked)}
                />
                Confirmei que o arquivo foi guardado neste aparelho
              </label>
              <button
                className="secondary"
                disabled={!packageSaved}
                onClick={async () => {
                  try {
                    await savePreparation(null);
                    onExit();
                  } catch {
                    setError("Não foi possível trocar acesso. A fila foi preservada.");
                  }
                }}
              >
                Já guardei o pacote; trocar acesso
              </button>
            </div>
          )}
        </section>
        <section className="device-section">
          <h3>Acesso do operador</h3>
          <p>
            Renove com o mesmo código para recuperar sua fila. Entrada e renovação exigem conexão.
          </p>
          <div className="device-actions">
            {expired && (
              <button className="primary" disabled={!online} onClick={onReauthenticate}>
                Renovar acesso
              </button>
            )}
            <button className="secondary" disabled={busy || exportBusy} onClick={logout}>
              Sair
            </button>
          </div>
        </section>
      </section>
      <nav className="operator-nav" aria-label="Navegação do operador">
        {[
          ["capturar", "Capturar", "◉"],
          ["registros", "Registros", "≡"],
          ["aparelho", "Aparelho", "⚙"],
        ].map(([value, label, icon]) => (
          <a key={value} href={"#" + value} aria-current={screen === value ? "page" : undefined}>
            <span aria-hidden="true">{icon}</span>
            {label}
          </a>
        ))}
      </nav>
    </main>
  );
}
