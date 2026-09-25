import type { Checkpoint, RaceEvent } from "@tempogo/contracts";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { kilometersToMeters, timezoneLabels } from "./admin-format";
import { api } from "./api";

export function EventForm({
  race,
  onSave,
  onCancel,
}: {
  race?: RaceEvent;
  onSave: (id: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [step, setStep] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [discard, setDiscard] = useState(false);
  const [values, setValues] = useState({
    name: race?.name ?? "",
    category_name: race?.category_name ?? "Corrida de rua",
    local_date: race?.local_date ?? "",
    location: race?.location ?? "",
    timezone: race?.timezone ?? "America/Sao_Paulo",
    distance: race?.distance_m == null ? "" : String(race.distance_m / 1000).replace(".", ","),
  });
  const [dirty, setDirty] = useState(false);
  const form = useRef<HTMLFormElement>(null),
    heading = useRef<HTMLHeadingElement>(null),
    savedId = useRef<string | null>(null),
    submitting = useRef(false);
  useEffect(() => {
    heading.current?.focus();
  }, [step]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty && !savedId.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function update(key: keyof typeof values, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
    setDirty(true);
    setError("");
  }
  function next() {
    if (!form.current?.reportValidity()) return;
    try {
      kilometersToMeters(values.distance);
      setError("");
      setStep((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (step < 2) {
      next();
      return;
    }
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      if (!savedId.current) {
        const result = await api<{ id: string }>(
          race ? "/events/" + race.id : "/events",
          race ? "PATCH" : "POST",
          {
            name: values.name.trim(),
            category_name: values.category_name.trim(),
            local_date: values.local_date,
            location: values.location.trim(),
            timezone: values.timezone,
            distance_m: kilometersToMeters(values.distance),
            ...(race ? { expected_version: race.version } : {}),
          },
        );
        savedId.current = race?.id ?? result.id;
      }
      setDirty(false);
      await onSave(savedId.current);
    } catch (e) {
      setError(
        (savedId.current
          ? "Evento salvo. Não foi possível abrir o painel. Tente abrir novamente. "
          : "") + (e as Error).message,
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <form ref={form} className="guided-form" onSubmit={submit}>
      <div className="wizard-progress" aria-label="Etapas do cadastro">
        {["Identificação", "Data e local", "Conferência"].map((label, index) => (
          <span key={label} aria-current={step === index ? "step" : undefined}>
            <b>{index + 1}</b>
            <span>{label}</span>
          </span>
        ))}
      </div>
      <div className="guided-body">
        <p className="eyebrow">PASSO {step + 1} DE 3</p>
        <h2 ref={heading} tabIndex={-1}>
          {["Vamos conhecer sua prova", "Quando e onde será?", "Confira antes de salvar"][step]}
        </h2>
        <p className="muted">
          {
            [
              "Comece pelo básico. Os pontos do percurso vêm depois.",
              "Confira a data e o fuso usados pela organização.",
              "Seu evento fica em rascunho até você preparar a operação.",
            ][step]
          }
        </p>
        {step === 0 && (
          <>
            <label>
              Nome do evento
              <input
                name="name"
                required
                minLength={2}
                maxLength={120}
                value={values.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder="Ex.: Corrida do Parque"
              />
            </label>
            <label>
              Modalidade
              <input
                name="category_name"
                required
                minLength={2}
                maxLength={120}
                value={values.category_name}
                onChange={(e) => update("category_name", e.target.value)}
              />
            </label>
            <label>
              Distância (km, opcional)
              <input
                name="distance"
                inputMode="decimal"
                value={values.distance}
                onChange={(e) => update("distance", e.target.value)}
                placeholder="Ex.: 5 ou 21,1"
                aria-describedby="event-distance-help"
              />
            </label>
            <div className="distance-presets" aria-label="Distâncias frequentes">
              {["5", "10", "21,1", "42,195"].map((km) => (
                <button
                  type="button"
                  key={km}
                  aria-pressed={values.distance === km}
                  onClick={() => update("distance", km)}
                >
                  {km} km
                </button>
              ))}
            </div>
            <p className="field-help" id="event-distance-help">
              Pode deixar em branco. Esta prova terá uma modalidade, sem voltas.
            </p>
          </>
        )}
        {step === 1 && (
          <>
            <label>
              Data da prova
              <input
                name="local_date"
                type="date"
                required
                value={values.local_date}
                onChange={(e) => update("local_date", e.target.value)}
              />
            </label>
            <label>
              Local
              <input
                name="location"
                maxLength={200}
                value={values.location}
                onChange={(e) => update("location", e.target.value)}
                placeholder="Parque, cidade ou endereço"
              />
            </label>
            <p className="field-help">
              O local é opcional e ajuda sua equipe a identificar a prova.
            </p>
            <label>
              Fuso horário
              <select
                name="timezone"
                value={values.timezone}
                onChange={(e) => update("timezone", e.target.value)}
              >
                {Array.from(new Set([...Object.keys(timezoneLabels), values.timezone])).map(
                  (zone) => (
                    <option key={zone} value={zone}>
                      {timezoneLabels[zone] ?? zone}
                    </option>
                  ),
                )}
              </select>
            </label>
            <p className="field-help">
              Use o fuso do local da prova, mesmo que esteja cadastrando de outra região.
            </p>
          </>
        )}
        {step === 2 && (
          <>
            <dl className="review-summary">
              <div>
                <dt>Evento</dt>
                <dd>{values.name}</dd>
              </div>
              <div>
                <dt>Modalidade e distância</dt>
                <dd>
                  {values.category_name} ·{" "}
                  {values.distance ? values.distance + " km" : "Distância não informada"}
                </dd>
              </div>
              <div>
                <dt>Data</dt>
                <dd>{values.local_date.split("-").reverse().join("/")}</dd>
              </div>
              <div>
                <dt>Local</dt>
                <dd>{values.location || "Não informado"}</dd>
              </div>
              <div>
                <dt>Fuso horário</dt>
                <dd>{timezoneLabels[values.timezone] ?? values.timezone}</dd>
              </div>
            </dl>
            {!savedId.current && (
              <button
                className="text-button"
                type="button"
                disabled={busy}
                onClick={() => setStep(0)}
              >
                Revisar dados preenchidos
              </button>
            )}
            <p className="next-hint">
              Depois de salvar: organize os pontos onde a equipe vai registrar as passagens.
            </p>
          </>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {discard && (
          <div className="discard-confirm" role="alert">
            <p>Descartar os dados ainda não salvos?</p>
            <button type="button" className="secondary" onClick={() => setDiscard(false)}>
              Continuar preenchendo
            </button>
            <button type="button" className="text-button" onClick={onCancel}>
              Descartar e sair
            </button>
          </div>
        )}
      </div>
      <div className="guided-actions">
        {step > 0 && !savedId.current && (
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => {
              setStep(step - 1);
              setError("");
            }}
          >
            Voltar
          </button>
        )}
        <button className="primary" disabled={busy}>
          {busy
            ? "Salvando…"
            : savedId.current
              ? "Abrir evento salvo"
              : step < 2
                ? "Continuar"
                : "Salvar evento"}
        </button>
        <button
          type="button"
          className="text-button"
          disabled={busy}
          onClick={() => (dirty && !savedId.current ? setDiscard(true) : onCancel())}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

export function CheckpointForm({
  checkpoint,
  next,
  points,
  eventId,
  onSaved,
  onCancel,
}: {
  checkpoint?: Checkpoint;
  next: number;
  points: Checkpoint[];
  eventId: string;
  onSaved: () => Promise<void>;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState(
    checkpoint?.kind ??
      (!points.some((p) => p.active && p.kind === "start") ? "start" : "intermediate"),
  );
  const [name, setName] = useState(checkpoint?.name ?? (kind === "start" ? "Largada" : ""));
  const [sequence, setSequence] = useState(String(checkpoint?.sequence ?? next));
  const [distance, setDistance] = useState(
    checkpoint?.distance_m == null
      ? kind === "start"
        ? "0"
        : ""
      : String(checkpoint.distance_m / 1000).replace(".", ","),
  );
  const [active, setActive] = useState(checkpoint?.active ?? true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [discard, setDiscard] = useState(false);
  const saved = useRef(false),
    locking = useRef(false),
    heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty && !saved.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (locking.current) return;
    locking.current = true;
    setBusy(true);
    setError("");
    try {
      if (!saved.current) {
        await api(
          checkpoint ? "/checkpoints/" + checkpoint.id : "/events/" + eventId + "/checkpoints",
          checkpoint ? "PATCH" : "POST",
          {
            name: name.trim(),
            kind,
            sequence: Number(sequence),
            distance_m: kilometersToMeters(distance, true),
            active,
            ...(checkpoint ? { expected_version: checkpoint.version } : {}),
          },
        );
        saved.current = true;
      }
      setDirty(false);
      await onSaved();
    } catch (e) {
      setError(
        (saved.current ? "Ponto salvo. Tente atualizar o percurso. " : "") + (e as Error).message,
      );
    } finally {
      locking.current = false;
      setBusy(false);
    }
  }
  function choose(value: string) {
    setKind(value);
    setDirty(true);
    if (!name || ["Largada", "Chegada"].includes(name))
      setName(value === "start" ? "Largada" : value === "finish" ? "Chegada" : "");
    if (value === "start") setDistance("0");
  }
  return (
    <form className="guided-form checkpoint-editor" onSubmit={submit}>
      <div className="guided-body">
        <p className="eyebrow">PONTO DO PERCURSO</p>
        <h2 ref={heading} tabIndex={-1}>
          {checkpoint ? "Editar checkpoint" : "Novo checkpoint"}
        </h2>
        <p className="muted">
          Um checkpoint é um ponto onde sua equipe registra a passagem dos corredores.
        </p>
        <fieldset className="kind-options">
          <legend>Qual é a função deste ponto?</legend>
          {[
            ["start", "Largada", "Onde a prova começa"],
            ["intermediate", "Intermediário", "Uma passagem durante a prova"],
            ["finish", "Chegada", "Onde os corredores terminam"],
          ].map(([value, label, help]) => (
            <label key={value} className={kind === value ? "selected" : ""}>
              <input
                type="radio"
                name="kind"
                value={value}
                checked={kind === value}
                onChange={() => choose(value ?? "intermediate")}
              />
              <span>
                <strong>{label}</strong>
                <small>{help}</small>
              </span>
            </label>
          ))}
        </fieldset>
        <label>
          Nome do checkpoint
          <input
            name="name"
            required
            minLength={2}
            maxLength={120}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setDirty(true);
            }}
            placeholder="Ex.: Praça central · km 2,5"
          />
        </label>
        <label>
          Distância acumulada (km)
          <input
            name="distance"
            inputMode="decimal"
            value={distance}
            onChange={(e) => {
              setDistance(e.target.value);
              setDirty(true);
            }}
            placeholder="Ex.: 2,5"
            aria-describedby="checkpoint-distance-help"
          />
        </label>
        <p className="field-help" id="checkpoint-distance-help">
          Distância desde a largada até este ponto. Na largada, use 0. Pode deixar em branco.
        </p>
        <label>
          Ordem no percurso
          <input
            name="sequence"
            type="number"
            inputMode="numeric"
            min={1}
            max={10000}
            step={1}
            required
            value={sequence}
            onChange={(e) => {
              setSequence(e.target.value);
              setDirty(true);
            }}
          />
        </label>
        <p className="field-help">
          Posição {sequence || "—"} na sequência dos pontos. Cada posição deve ser única.
        </p>
        {!!points.length && (
          <details className="route-reference">
            <summary>Ver a ordem dos pontos cadastrados</summary>
            <ol>
              {points.map((p) => (
                <li key={p.id}>
                  {p.sequence}. {p.name}
                  {checkpoint?.id === p.id ? " (este ponto)" : ""}
                </li>
              ))}
            </ol>
          </details>
        )}
        <label className="checkbox">
          <input
            name="active"
            type="checkbox"
            checked={active}
            onChange={(e) => {
              setActive(e.target.checked);
              setDirty(true);
            }}
          />
          Checkpoint ativo
        </label>
        <p className="field-help">
          Pontos inativos ficam fora da operação. Os acessos são configurados depois de salvar.
        </p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {discard && (
          <div className="discard-confirm" role="alert">
            <p>Descartar as alterações deste ponto?</p>
            <button type="button" className="secondary" onClick={() => setDiscard(false)}>
              Continuar preenchendo
            </button>
            <button type="button" className="text-button" onClick={onCancel}>
              Descartar e sair
            </button>
          </div>
        )}
      </div>
      <div className="guided-actions">
        <button className="primary" disabled={busy}>
          {busy ? "Salvando…" : saved.current ? "Atualizar percurso" : "Salvar checkpoint"}
        </button>
        <button
          className="secondary"
          type="button"
          disabled={busy}
          onClick={() => (dirty && !saved.current ? setDiscard(true) : onCancel())}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
