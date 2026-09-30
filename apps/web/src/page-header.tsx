import { createContext, type ReactNode, useContext } from "react";
import { createPortal } from "react-dom";

export const HeaderContext = createContext<HTMLElement | null>(null);
export const HeaderActionsContext = createContext<HTMLElement | null>(null);

export function HeaderContent({ children }: { children: ReactNode }) {
  const target = useContext(HeaderContext);
  return target ? createPortal(children, target) : null;
}
export function HeaderActions({ children }: { children: ReactNode }) {
  const target = useContext(HeaderActionsContext);
  return target ? createPortal(children, target) : <>{children}</>;
}
