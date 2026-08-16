import type { ReactNode } from "react";
import { BrandLogo } from "./BrandLogo";
import "../styles/atmospheric-page.css";

type AtmosphericPageProps = {
  children: ReactNode;
  className?: string;
};

export function AtmosphericPage({
  children,
  className = "",
}: AtmosphericPageProps) {
  const classes = ["atmospheric-page", className].filter(Boolean).join(" ");

  return (
    <main className={classes}>
      <div className="atmospheric-page__content">
        <div className="atmospheric-page__brand">
          <BrandLogo />
        </div>
        {children}
      </div>
    </main>
  );
}
