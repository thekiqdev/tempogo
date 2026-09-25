import { useEffect, useRef, useState } from "react";
import { Accounts } from "./platform-accounts";
import { useActionConfirmation } from "./platform-dialog";
import { PlatformIcon } from "./platform-icons";
import { InvitationDirectory } from "./platform-invitations";
import { Organizations } from "./platform-organizations";
import { AuditPanel, OverviewPanel } from "./platform-overview";

const links = [
  ["", "Visão geral", "◫"],
  ["organizacoes", "Organizações", "▦"],
  ["pessoas", "Pessoas", "♧"],
  ["super-admins", "Super admins", "◇"],
  ["convites", "Convites", "✉"],
  ["auditoria", "Auditoria", "≡"],
] as const;
export function PlatformWorkspace({
  csrf,
  user,
  onReauth,
  onLogout,
  notice,
}: {
  csrf: string;
  user: string;
  notice?: string;
  onReauth: () => void;
  onLogout: () => void;
}) {
  const [path, setPath] = useState(location.pathname),
    [menu, setMenu] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null),
    dirty = useRef(false),
    returnMenuFocus = useRef(false),
    previousUrl = useRef(location.pathname + location.search);
  const confirmation = useActionConfirmation();
  useEffect(() => {
    const saved = () => {
      dirty.current = false;
    };
    const unload = (e: BeforeUnloadEvent) => {
      if (dirty.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("platform:saved", saved);
    window.addEventListener("beforeunload", unload);
    return () => {
      window.removeEventListener("platform:saved", saved);
      window.removeEventListener("beforeunload", unload);
    };
  }, []);
  useEffect(() => {
    if (menu) document.querySelector<HTMLElement>(".crm-sidebar nav a")?.focus();
    else if (returnMenuFocus.current) {
      menuButton.current?.focus();
      returnMenuFocus.current = false;
    }
  }, [menu]);
  useEffect(() => {
    const update = () => {
      if (dirty.current && !window.confirm("Sair e descartar alterações não salvas?")) {
        history.pushState(null, "", previousUrl.current);
        return;
      }
      dirty.current = false;
      previousUrl.current = location.pathname + location.search;
      setPath(location.pathname);
      setMenu(false);
    };
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  const section = path.split("/")[2] ?? "",
    current = links.find((l) => l[0] === section);
  async function navigate(value: string) {
    if (dirty.current) {
      const decision = await confirmation.confirm("Descartar alterações não salvas?", false);
      if (decision === null) return;
    }
    dirty.current = false;
    history.pushState(null, "", "/plataforma" + (value ? "/" + value : ""));
    previousUrl.current = location.pathname + location.search;
    setPath(location.pathname);
    setMenu(false);
    window.scrollTo(0, 0);
  }
  return (
    <div
      className="platform-workspace"
      onChangeCapture={(e) => {
        if ((e.target as HTMLElement).closest("[data-draft]")) dirty.current = true;
      }}
    >
      {confirmation.element}
      <a className="platform-skip" href="#platform-content">
        Ir para o conteúdo
      </a>
      <aside
        className={"crm-sidebar " + (menu ? "is-open" : "")}
        aria-label="Navegação da plataforma"
        onKeyDown={(e) => {
          if (menu && e.key === "Tab") {
            const focusable = Array.from(
              e.currentTarget.querySelectorAll<HTMLElement>("a,button"),
            ).filter((el) => el.offsetParent !== null);
            const first = focusable[0],
              last = focusable.at(-1);
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first?.focus();
            }
          }
          if (e.key === "Escape") {
            returnMenuFocus.current = true;
            setMenu(false);
          }
        }}
      >
        <a
          className="crm-brand"
          href="/plataforma"
          onClick={(e) => {
            e.preventDefault();
            navigate("");
          }}
        >
          Tempo<span>Go</span>
        </a>
        <p className="crm-eyebrow">ADMINISTRAÇÃO</p>
        <nav>
          {links.map(([value, label]) => (
            <a
              key={value}
              href={"/plataforma" + (value ? "/" + value : "")}
              aria-current={section === value ? "page" : undefined}
              onClick={(e) => {
                if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
                e.preventDefault();
                navigate(value);
              }}
            >
              <PlatformIcon name={value} />
              {label}
            </a>
          ))}
        </nav>
        <div className="crm-sidebar-bottom">
          <span>Ambiente da plataforma</span>
          <p>Organizações e acessos</p>
          <button
            className="crm-mobile-close"
            onClick={() => {
              returnMenuFocus.current = true;
              setMenu(false);
            }}
          >
            Fechar menu
          </button>
        </div>
      </aside>
      <div className="crm-main" inert={menu}>
        <header className="crm-topbar">
          <button
            ref={menuButton}
            className="crm-menu-button"
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          >
            Menu
          </button>
          <span>Painel do super admin</span>
          <details className="crm-account">
            <summary>{user}</summary>
            <div>
              <p>Autenticação em duas etapas ativa</p>
              <button
                onClick={(e) => {
                  e.currentTarget.closest("details")?.removeAttribute("open");
                  onReauth();
                }}
              >
                Confirmar identidade
              </button>
              <button onClick={onLogout}>Sair da plataforma</button>
            </div>
          </details>
        </header>
        <main id="platform-content" className="crm-content" tabIndex={-1}>
          {notice && (
            <p role="status" className="crm-notice">
              {notice}
            </p>
          )}
          <p className="crm-breadcrumb">Plataforma / {current?.[1] ?? "Página não encontrada"}</p>
          <h1>{current?.[1] ?? "Página não encontrada"}</h1>
          {section === "" ? (
            <OverviewPanel />
          ) : section === "organizacoes" ? (
            <Organizations csrf={csrf} routeId={path.split("/")[3] ?? ""} />
          ) : section === "pessoas" || section === "super-admins" ? (
            <Accounts
              key={section}
              csrf={csrf}
              onlySuper={section === "super-admins"}
              routeId={path.split("/")[3] ?? ""}
            />
          ) : section === "convites" ? (
            <InvitationDirectory csrf={csrf} />
          ) : section === "auditoria" ? (
            <AuditPanel />
          ) : (
            <p>
              Este endereço não existe. <a href="/plataforma">Voltar à visão geral</a>
            </p>
          )}
        </main>
      </div>
    </div>
  );
}
