import { type FormEvent, useEffect, useState } from "react";
export function useMfaRequired() {
  const [required, setRequired] = useState(true);
  useEffect(() => {
    const refresh = () => {
      void fetch("/api/v1/platform/auth/me")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d) setRequired(d.mfa_required);
        })
        .catch(() => {});
    };
    refresh();
    window.addEventListener("platform:settings", refresh);
    return () => window.removeEventListener("platform:settings", refresh);
  }, []);
  return required;
}
export function PlatformLogo() {
  const [logo, setLogo] = useState<string | null>(null);
  useEffect(() => {
    const refresh = () => {
      void fetch("/api/v1/platform/branding")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => setLogo(d?.logo_data_url ?? null))
        .catch(() => {});
    };
    refresh();
    window.addEventListener("platform:settings", refresh);
    return () => window.removeEventListener("platform:settings", refresh);
  }, []);
  return logo ? (
    <img className="platform-custom-logo" src={logo} alt="Logo da plataforma" />
  ) : (
    <>
      Tempo<span>Go</span>
    </>
  );
}
type PoolItem = {
  port: number;
  state: string;
  checkpoint_id: string | null;
  checkpoint_name: string | null;
  event_id: string | null;
  note: string | null;
  live: boolean;
};
type WiclaxPool = {
  ports: number[];
  free: number;
  busy: number;
  blocked: number;
  exhausted: boolean;
  items: PoolItem[];
};
type Settings = {
  logo_data_url: string | null;
  mfa_required: boolean;
  version: number;
  wiclax_ports_text: string;
  wiclax_pool?: WiclaxPool;
};
export function PlatformSettings({ csrf }: { csrf: string }) {
  const [data, setData] = useState<Settings | null>(null),
    [portsText, setPortsText] = useState("3097-3116"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    void fetch("/api/v1/platform/settings")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error?.message);
        setData(d);
        setPortsText(d.wiclax_ports_text ?? "3097-3116");
      })
      .catch((e) => setError(e.message));
  }, []);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy || !data) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await fetch("/api/v1/platform/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
        body: JSON.stringify({
          logo_data_url: data.logo_data_url,
          mfa_required: data.mfa_required,
          wiclax_ports: portsText,
          version: data.version,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error?.message ?? "Não foi possível salvar.");
      setData({
        logo_data_url: d.logo_data_url,
        mfa_required: d.mfa_required,
        version: d.version,
        wiclax_ports_text: d.wiclax_ports_text,
        wiclax_pool: d.wiclax_pool,
      });
      setPortsText(d.wiclax_ports_text ?? portsText);
      setNotice("Configurações salvas.");
      window.dispatchEvent(new Event("platform:saved"));
      window.dispatchEvent(new Event("platform:settings"));
      if (d.requires_login) window.dispatchEvent(new Event("platform:session-required"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function upload(file?: File) {
    if (!file || !data) return;
    setError("");
    setNotice("");
    if (!["image/png", "image/jpeg"].includes(file.type) || file.size > 256 * 1024) {
      setError("Selecione uma imagem PNG ou JPEG de até 256 KB.");
      return;
    }
    try {
      const value = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(Error("Não foi possível ler a imagem."));
        reader.readAsDataURL(file);
      });
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(Error("Imagem inválida."));
        img.src = value;
      });
      setData({ ...data, logo_data_url: value });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <form className="platform-settings" data-draft="true" onSubmit={save}>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {!data ? (
        <p>Carregando configurações…</p>
      ) : (
        <>
          <section className="platform-settings-card">
            <h2>Identidade da plataforma</h2>
            <p>Personalize o logo exibido no acesso e no painel do superadmin.</p>
            <div className="platform-logo-preview">
              {data.logo_data_url ? (
                <img src={data.logo_data_url} alt="Prévia do logo" />
              ) : (
                <strong>TempoGo</strong>
              )}
            </div>
            <label>
              Logo da plataforma
              <input
                disabled={busy}
                type="file"
                accept="image/png,image/jpeg"
                onChange={(e) => void upload(e.target.files?.[0])}
              />
            </label>
            <p>PNG ou JPEG, até 256 KB. Prefira um logo horizontal com fundo transparente.</p>
            {data.logo_data_url && (
              <button
                type="button"
                disabled={busy}
                onClick={() => setData({ ...data, logo_data_url: null })}
              >
                Restaurar logo TempoGo
              </button>
            )}
          </section>
          <section className="platform-settings-card">
            <h2>Segurança do acesso</h2>
            <label className="platform-security-toggle">
              <input
                type="checkbox"
                role="switch"
                disabled={busy}
                checked={data.mfa_required}
                onChange={(e) => setData({ ...data, mfa_required: e.target.checked })}
              />
              <span>Exigir Authenticator dos superadmins</span>
            </label>
            <p>
              {data.mfa_required
                ? "Ao entrar, cada superadmin deverá configurar ou informar o código do Authenticator. Sessões iniciadas somente com senha precisarão entrar novamente."
                : "Os superadmins entram com email e senha, sem exigir o Authenticator. A confirmação de identidade usa apenas a senha."}
            </p>
          </section>
          <section className="platform-settings-card">
            <h2>Portas Wiclax</h2>
            <p>
              Cadastre aqui as portas TCP já publicadas no Easypanel (ex.: 3097-3116). O organizador
              conecta um checkpoint e o sistema escolhe a próxima porta livre automaticamente.
            </p>
            <label>
              Pool de portas
              <input
                value={portsText}
                disabled={busy}
                placeholder="3097-3116"
                onChange={(e) => setPortsText(e.target.value)}
              />
            </label>
            <p>
              Use faixa (`3097-3116`) ou lista (`3097, 3098, 3100`). Publique as mesmas portas no
              serviço da API no Easypanel antes de usar em produção.
            </p>
            {data.wiclax_pool && (
              <>
                <p role="status">
                  {data.wiclax_pool.free} livres · {data.wiclax_pool.busy} ocupadas ·{" "}
                  {data.wiclax_pool.blocked} bloqueadas de {data.wiclax_pool.ports.length}
                </p>
                {data.wiclax_pool.exhausted && (
                  <p role="alert" className="error">
                    Pool esgotado. Desconecte checkpoints, limpe bloqueios ou amplie as portas
                    publicadas.
                  </p>
                )}
                <div className="wiclax-pool-table-wrap">
                  <table className="wiclax-pool-table">
                    <thead>
                      <tr>
                        <th>Porta</th>
                        <th>Situação</th>
                        <th>Checkpoint</th>
                        <th>Detalhe</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.wiclax_pool.items.map((item) => (
                        <tr key={item.port} className={"is-" + item.state}>
                          <td>
                            <code>{item.port}</code>
                          </td>
                          <td>
                            {item.state === "free"
                              ? "Livre"
                              : item.state === "blocked"
                                ? "Bloqueada"
                                : item.live
                                  ? "Em uso"
                                  : "Reservada"}
                          </td>
                          <td>{item.checkpoint_name ?? "—"}</td>
                          <td>{item.note ?? (item.live ? "Bridge ativo" : "—")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {data.wiclax_pool.blocked > 0 && (
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy}
                    onClick={() => {
                      void (async () => {
                        setBusy(true);
                        setError("");
                        try {
                          const r = await fetch("/api/v1/platform/settings/wiclax-clear-blocked", {
                            method: "POST",
                            headers: { "X-CSRF-Token": csrf },
                          });
                          const d = await r.json();
                          if (!r.ok) throw Error(d.error?.message ?? "Falha ao limpar bloqueios.");
                          setData({ ...data, wiclax_pool: d.wiclax_pool });
                          setNotice("Bloqueios de porta limpos.");
                        } catch (e) {
                          setError((e as Error).message);
                        } finally {
                          setBusy(false);
                        }
                      })();
                    }}
                  >
                    Limpar portas bloqueadas
                  </button>
                )}
              </>
            )}
          </section>
          <div>
            <button className="primary" disabled={busy}>
              {busy ? "Salvando…" : "Salvar configurações"}
            </button>
          </div>
        </>
      )}
    </form>
  );
}
