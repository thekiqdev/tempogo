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
type Settings = { logo_data_url: string | null; mfa_required: boolean; version: number };
export function PlatformSettings({ csrf }: { csrf: string }) {
  const [data, setData] = useState<Settings | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    void fetch("/api/v1/platform/settings")
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error?.message);
        setData(d);
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
        body: JSON.stringify(data),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error?.message ?? "Não foi possível salvar.");
      setData({ logo_data_url: d.logo_data_url, mfa_required: d.mfa_required, version: d.version });
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
