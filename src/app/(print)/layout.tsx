// Bare layout (no sidebar) for printable pages such as QR labels.
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-svh bg-white p-6 text-black print:p-0">{children}</div>;
}
