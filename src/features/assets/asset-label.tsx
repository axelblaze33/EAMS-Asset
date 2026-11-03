import { PrintButton } from "./print-button";

// A 2.5in × 1.25in sticker: QR on the left, identifiers on the right.
export function AssetLabel({
  svg,
  assetCode,
  name,
  serialNumber,
  company,
}: {
  svg: string;
  assetCode: string;
  name: string;
  serialNumber: string | null;
  company: string;
}) {
  return (
    <div className="flex h-[1.25in] w-[2.5in] break-inside-avoid items-center gap-2 overflow-hidden rounded border border-neutral-300 p-1.5 print:border-neutral-400">
      {/* SVG generated server-side by the qrcode library. */}
      <div className="size-[1.05in] shrink-0 [&_svg]:h-full [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="min-w-0 leading-tight">
        <div className="text-[7pt] font-medium tracking-wide text-neutral-500 uppercase">{company}</div>
        <div className="font-mono text-[11pt] font-bold">{assetCode}</div>
        <div className="line-clamp-2 text-[7.5pt]">{name}</div>
        {serialNumber && <div className="mt-0.5 truncate font-mono text-[6.5pt] text-neutral-600">S/N {serialNumber}</div>}
      </div>
    </div>
  );
}

export function PrintToolbar({ count }: { count: number }) {
  return (
    <div className="mb-6 flex items-center justify-between gap-4 print:hidden">
      <p className="text-sm text-neutral-600">
        {count} label{count === 1 ? "" : "s"}. Use your browser&apos;s print dialog (Ctrl/Cmd + P); set margins to “None” for sticker sheets.
      </p>
      <PrintButton />
    </div>
  );
}
