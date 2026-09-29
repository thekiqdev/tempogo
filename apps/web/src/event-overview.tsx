import type { Checkpoint, RaceEvent } from "@tempogo/contracts";
import { useEffect, useState } from "react";
import { api } from "./api";

type Preparation = {
  active_checkpoints: number;
  missing_access: { id: string; name: string }[];
  ready: boolean;
};
export function EventOverview({
  race,
  points,
  loading,
  onNavigate,
  onAdd,
  onOperate,
  busy,
}: {
  race: RaceEvent;
  points: Checkpoint[];
  loading: boolean;
  onNavigate: (tab: string) => void;
  onAdd: () => void;
  onOperate: (action: "start" | "pause" | "resume") => void;
  busy: boolean;
}) {
  const [preparation, setPreparation] = useState<Preparation | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const load = () =>
      api<Preparation>("/events/" + race.id + "/preparation")
        .then((d) => {
          if (active) {
            setPreparation(d);
            setError("");
          }
        })
        .catch((e) => {
          if (active) {
            setPreparation(null);
            setError(e.message);
          }
        });
    void load();
    const timer = setInterval(load, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [race.id, race.version]);
  const active = points.filter((p) => p.active),
    prestart = ["draft", "ready"].includes(race.state),
    paused = !!race.paused_for_edit;
  const ready = !!preparation?.ready && !loading;
  const tasks = [
    {
      title: "Dados do evento",
      done: true,
      description: "Nome, data e modalidade cadastrados.",
      pending: "Preencha os dados da prova.",
      action: "Conferir dados",
      tab: "settings",
    },
    {
      title: "Pontos do percurso",
      done: !loading && active.length > 0,
      description: active.length + " ponto(s) ativo(s) cadastrado(s).",
      pending: "Cadastre os locais onde a equipe registrará as passagens.",
      action: "Organizar percurso",
      tab: "checkpoints",
    },
    {
      title: "Acessos da equipe",
      done:
        !!preparation &&
        preparation.active_checkpoints > 0 &&
        preparation.missing_access.length === 0,
      description: "Todos os checkpoints ativos têm acesso válido.",
      pending: preparation?.missing_access.length
        ? "Crie acesso para: " + preparation.missing_access.map((p) => p.name).join(", ") + "."
        : "Crie um código e senha por aparelho, em cada checkpoint ativo.",
      action: "Configurar equipe",
      tab: "access",
    },
  ];
  return (
    <section className="event-overview" aria-label="Resumo do evento">
      <div className="next-step">
        <p className="eyebrow">
          {paused ? "COLETA PAUSADA" : prestart ? "PREPARAÇÃO E LARGADA" : "AGORA NA SUA PROVA"}
        </p>
        <h2>
          {loading
            ? "Conferindo seu percurso…"
            : paused
              ? "Evento pausado para edição"
              : prestart
                ? ready
                  ? "Tudo pronto para iniciar"
                  : active.length
                    ? "Confira sua equipe"
                    : "Comece pelo percurso"
                : race.state === "running"
                  ? "Sua prova está em andamento"
                  : "Confira os registros da prova"}
        </h2>
        {prestart || paused ? (
          <>
            <p>
              {paused
                ? "Conclua as alterações e retome a coleta. A largada original será mantida; o tempo da prova continua contando."
                : "Inicie a coleta aqui. O horário da largada será registrado no momento do clique, sem justificativa."}
            </p>
            {error && (
              <p role="alert" className="error">
                Não foi possível conferir a preparação: {error}
              </p>
            )}
            {!preparation && !error && <p role="status">Conferindo acessos da equipe…</p>}
            <button
              className="primary event-start-button"
              disabled={busy || !ready}
              onClick={() => onOperate(paused ? "resume" : "start")}
            >
              {busy ? "Atualizando…" : paused ? "Retomar evento" : "Iniciar evento"}
            </button>
            {!ready && (
              <p className="field-help">
                Conclua as pendências abaixo para {paused ? "retomar" : "iniciar"}.
              </p>
            )}
            {!loading && !active.length && (
              <button className="secondary" onClick={onAdd}>
                + Adicionar checkpoint
              </button>
            )}
          </>
        ) : (
          <>
            <p>
              {race.state === "running"
                ? "Acompanhe as passagens e a comunicação da equipe."
                : "Revise as pendências antes de finalizar sua prova."}
            </p>
            <button
              className="primary"
              onClick={() => onNavigate(race.state === "running" ? "observations" : "settings")}
            >
              {race.state === "running" ? "Acompanhar passagens" : "Conferir encerramento"}
            </button>
          </>
        )}
      </div>
      <div className="overview-title">
        <h2>
          {prestart
            ? "Prepare sua prova"
            : paused
              ? "Confira antes de retomar"
              : "Gerencie sua prova"}
        </h2>
        <p>
          {preparation
            ? tasks.filter((t) => t.done).length + " de " + tasks.length + " tarefas concluídas"
            : "Conferindo preparação…"}
        </p>
      </div>
      <ol className="setup-steps">
        {tasks.map((task, index) => (
          <li key={task.tab} className={task.done ? "setup-complete" : "setup-pending"}>
            <button onClick={() => onNavigate(task.tab)}>
              <span className="step-marker" aria-hidden="true">
                {task.done ? "✓" : index + 1}
              </span>
              <span>
                <strong>{task.title}</strong>
                <em>
                  {task.done
                    ? "Concluído"
                    : task.tab === "access" && !preparation
                      ? "Aguardando conferência"
                      : "Pendente"}
                </em>
                <small>{task.done ? task.description : task.pending}</small>
                <b className="setup-action">{task.done ? "Conferir" : "→ " + task.action}</b>
              </span>
              <span aria-hidden="true">›</span>
            </button>
          </li>
        ))}
      </ol>
      <button className="overview-communication" onClick={() => onNavigate("recovery")}>
        <span>
          <strong>Como estão os aparelhos?</strong>
          <small>Ver última comunicação e registros pendentes</small>
        </span>
        <span aria-hidden="true">›</span>
      </button>
    </section>
  );
}
