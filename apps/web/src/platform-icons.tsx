import type { SVGProps } from "react";

const shapes: Record<string, string> = {
  "": "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  organizacoes:
    "M4 21V3h12v18 M2 21h20 M8 7h1 M12 7h1 M8 11h1 M12 11h1 M8 15h1 M12 15h1 M16 9h4v12 M9 21v-3h3v3",
  pessoas:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 3a4 4 0 1 0 0 8a4 4 0 1 0 0-8 M17 4a4 4 0 0 1 0 7 M22 21v-2a4 4 0 0 0-3-3.8",
  "super-admins": "M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6z M8 12l3 3 5-6",
  convites: "M3 5h18v14H3z M3 6l9 7 9-7",
  auditoria: "M12 3a9 9 0 1 0 9 9a9 9 0 0 0-9-9 M12 7v5l3 2",
};
export function PlatformIcon({ name, ...props }: { name: string } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d={shapes[name] ?? shapes[""]} />
    </svg>
  );
}
