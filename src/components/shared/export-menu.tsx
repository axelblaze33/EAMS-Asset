"use client";

import { useSearchParams } from "next/navigation";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuGroup,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Downloads the current filtered list (filters come from the URL). */
export function ExportMenu({ endpoint }: { endpoint: string }) {
  const params = useSearchParams();
  const href = (format: "xlsx" | "csv") => {
    const next = new URLSearchParams(params.toString());
    next.delete("page");
    next.set("format", format);
    return `${endpoint}?${next}`;
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" />}>
        <Download />
        Export
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Current filters applied</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuItem render={<a href={href("xlsx")} download />}>
          <FileSpreadsheet />
          Excel (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem render={<a href={href("csv")} download />}>
          <FileText />
          CSV
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
