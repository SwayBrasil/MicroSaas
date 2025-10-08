import React from "react";

export function Page({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>{children}</main>
  );
}

export function PageHeader({
  title,
  right,
}: {
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 12,
      }}
    >
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0f172a" }}>
        {title}
      </h1>
      {right}
    </div>
  );
}

export function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: 16,
      }}
    >
      {children}
    </div>
  );
}
