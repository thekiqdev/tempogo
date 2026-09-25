import type { Checkpoint, RaceEvent } from "@tempogo/contracts";
export function EventOverview({
  race,
  points,
  loading,
  onNavigate,
  onAdd,
}: {
  race: RaceEvent;
  points: Checkpoint[];
  loading: boolean;
  onNavigate: (tab: string) => void;
  onAdd: () => void;
}) {
  const active = points.filter((p) => p.active);
  const draft = race.state === "draft";
  const action = draft
    ? active.length
      ? [
          "Confira sua equipe",
          "Com o percurso cadastrado, gere um acesso para cada aparelho.",
          "Configurar equipe",
          "access",
        ]
      : [
          "Comece pelo percurso",
          "Adicione os pontos onde sua equipe vai registrar os corredores.",
          "+ Adicionar checkpoint",
          "checkpoints",
        ]
    : race.state === "ready"
      ? [
          "Tudo pronto para a largada?",
          "Confira os aparelhos e informe o horário real antes de iniciar a coleta.",
          "Conferir início da prova",
          "settings",
        ]
      : race.state === "running"
        ? [
            "Sua prova está em andamento",
            "Acompanhe as passagens e confira a comunicação dos aparelhos.",
            "Acompanhar passagens",
            "observations",
          ]
        : race.state === "closed"
          ? [
              "Hora de conferir os registros",
              "Revise as pendências e concilie os aparelhos antes de finalizar.",
              "Conferir encerramento",
              "settings",
            ]
          : [
              "Consulte sua prova",
              "Veja as passagens e o histórico das decisões da organização.",
              "Consultar passagens",
              "observations",
            ];
  return (
    <section className="event-overview" aria-label="Resumo do evento">
      <div className="next-step">
        <p className="eyebrow">{draft ? "PRÓXIMO PASSO" : "AGORA NA SUA PROVA"}</p>
        <h2>{loading ? "Conferindo seu percurso…" : action[0]}</h2>
        <p>{action[1]}</p>
        <button
          className="primary"
          disabled={loading}
          onClick={() => (draft && !active.length ? onAdd() : onNavigate(action[3] ?? "settings"))}
        >
          {action[2]}
        </button>
      </div>
      <div className="overview-title">
        <h2>{draft ? "Prepare sua prova" : "Gerencie sua prova"}</h2>
        <p>Entre em cada etapa para conferir ou ajustar.</p>
      </div>
      <ol className="setup-steps">
        <li>
          <button onClick={() => onNavigate("settings")}>
            <span className="step-marker">1</span>
            <span>
              <strong>Dados do evento</strong>
              <small>Nome, data, local e distância</small>
              <em>Dados cadastrados</em>
            </span>
            <span aria-hidden="true">›</span>
          </button>
        </li>
        <li>
          <button onClick={() => onNavigate("checkpoints")}>
            <span className="step-marker">2</span>
            <span>
              <strong>Pontos do percurso</strong>
              <small>Onde registrar cada passagem</small>
              <em>
                {loading
                  ? "Carregando…"
                  : active.length
                    ? active.length + " ponto(s) ativo(s)"
                    : "Adicione seu primeiro ponto"}
              </em>
            </span>
            <span aria-hidden="true">›</span>
          </button>
        </li>
        <li>
          <button onClick={() => onNavigate("access")}>
            <span className="step-marker">3</span>
            <span>
              <strong>Acessos da equipe</strong>
              <small>Um código e senha para cada aparelho</small>
              <em>Conferir acessos</em>
            </span>
            <span aria-hidden="true">›</span>
          </button>
        </li>
        <li>
          <button onClick={() => onNavigate("settings")}>
            <span className="step-marker">4</span>
            <span>
              <strong>
                {draft || race.state === "ready" ? "Preparar e iniciar" : "Operação e encerramento"}
              </strong>
              <small>
                {draft || race.state === "ready"
                  ? "Revise a preparação antes da largada"
                  : "Confira a coleta, revisões e conciliação"}
              </small>
            </span>
            <span aria-hidden="true">›</span>
          </button>
        </li>
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
