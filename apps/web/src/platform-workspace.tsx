import { useEffect, useRef, useState } from "react";
import { Accounts } from "./platform-accounts";
import { useActionConfirmation } from "./platform-dialog";
import { PlatformIcon } from "./platform-icons";
import { InvitationDirectory } from "./platform-invitations";
import { Organizations } from "./platform-organizations";
import { AuditPanel, OverviewPanel } from "./platform-overview";
import { PlatformLogo, PlatformSettings, useMfaRequired } from "./platform-settings";

const links = [
  ["", "Visão geral", "◫"],
  ["organizacoes", "Organizações", "▦"],
  ["super-admins", "Super admins", "◇"],
  ["convites", "Convites", "✉"],
  ["auditoria", "Auditoria", "≡"],
  ["configuracoes", "Configurações", "⚙"],
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
  const mfaRequired = useMfaRequired();
  const [path, setPath] = useState(location.pathname),
    [menu, setMenu] = useState(false),
    [collapsed, setCollapsed] = useState(() => {
      try {
        return localStorage.getItem("tempogo:sidebar-collapsed") === "true";
      } catch {
        return false;
      }
    });
  const menuButton = useRef<HTMLButtonElement>(null),
    dirty = useRef(false),
    returnMenuFocus = useRef(false),
    previousUrl = useRef(location.pathname + location.search);
  const confirmation = useActionConfirmation();
  useEffect(() => {
    try {
      localStorage.setItem("tempogo:sidebar-collapsed", String(collapsed));
    } catch {
      /* Navigation works without storage. */
    }
  }, [collapsed]);
  useEffect(() => {
    const media = matchMedia("(min-width: 851px)");
    const resize = () => {
      if (media.matches) setMenu(false);
    };
    media.addEventListener("change", resize);
    return () => media.removeEventListener("change", resize);
  }, []);
  useEffect(() => {
    if (!menu) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [menu]);
  function closeMenu() {
    returnMenuFocus.current = true;
    setMenu(false);
  }

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
      className={"platform-workspace" + (collapsed ? " is-collapsed" : "")}
      onChangeCapture={(e) => {
        if ((e.target as HTMLElement).closest("[data-draft]")) dirty.current = true;
      }}
    >
      {confirmation.element}
      <a className="platform-skip" href="#platform-content">
        Ir para o conteúdo
      </a>
      {menu && (
        <button
          className="crm-menu-backdrop"
          tabIndex={-1}
          aria-label="Fechar navegação"
          onClick={closeMenu}
        />
      )}
      <aside
        id="platform-navigation"
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
          aria-label="TempoGo — visão geral"
          href="/plataforma"
          onClick={(e) => {
            e.preventDefault();
            navigate("");
          }}
        >
          <span className="crm-brand-full">
            <PlatformLogo />
          </span>
          <span className="crm-brand-short" aria-hidden="true">
            T<span>G</span>
          </span>
        </a>
        <p className="crm-eyebrow">ESPAÇO DE GESTÃO</p>
        <nav>
          {links.map(([value, label]) => (
            <a
              key={value}
              aria-label={label}
              title={collapsed ? label : undefined}
              className={value === "convites" ? "crm-nav-secondary" : undefined}
              href={"/plataforma" + (value ? "/" + value : "")}
              aria-current={section === value ? "page" : undefined}
              onClick={(e) => {
                if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
                e.preventDefault();
                navigate(value);
              }}
            >
              <PlatformIcon name={value} />
              <span className="crm-nav-label">{label}</span>
            </a>
          ))}
        </nav>
        <div className="crm-sidebar-bottom">
          <div className="crm-environment">
            <span className="crm-environment-dot" aria-hidden="true" />
            <span className="crm-footer-label">TempoGo · Plataforma</span>
          </div>
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
            aria-controls="platform-navigation"
            onClick={() => setMenu(!menu)}
          >
            Menu
          </button>
          <button
            className="crm-collapse-button"
            aria-controls="platform-navigation"
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expandir painel lateral" : "Recolher painel lateral"}
            title={collapsed ? "Expandir painel lateral" : "Recolher painel lateral"}
            onClick={() => setCollapsed(!collapsed)}
          >
            <PlatformIcon name="sidebar" />
          </button>
          <span className="crm-topbar-context">
            Administração <span>/ {current?.[1] ?? "Plataforma"}</span>
          </span>
          <details className="crm-account">
            <summary aria-label={"Conta: " + user}>
              <span className="crm-avatar" aria-hidden="true">
                {user.slice(0, 1).toUpperCase()}
              </span>
              <span className="crm-account-name">{user}</span>
              <span aria-hidden="true">⌄</span>
            </summary>
            <div>
              <p>{mfaRequired ? "Authenticator obrigatório" : "Acesso com email e senha"}</p>
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
          <h1 className="platform-sr-only">{current?.[1] ?? "Página não encontrada"}</h1>
          {path.split("/")[3] && (
            <p className="crm-breadcrumb">Plataforma / {current?.[1] ?? "Página não encontrada"}</p>
          )}
          {section === "" ? (
            <OverviewPanel />
          ) : section === "organizacoes" ? (
            <Organizations csrf={csrf} routeId={path.split("/")[3] ?? ""} />
          ) : section === "super-admins" ? (
            <Accounts
              key={section}
              csrf={csrf}
              onlySuper={section === "super-admins"}
              routeId={path.split("/")[3] ?? ""}
            />
          ) : section === "pessoas" ? (
            <p>
              Os acessos agora são gerenciados dentro da organização.{" "}
              <a href="/plataforma/organizacoes">Selecionar organização</a>
            </p>
          ) : section === "convites" ? (
            <InvitationDirectory csrf={csrf} />
          ) : section === "configuracoes" ? (
            <PlatformSettings csrf={csrf} />
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
