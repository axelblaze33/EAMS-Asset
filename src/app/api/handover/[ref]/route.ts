import { authorizeRoute } from "@/lib/route-auth";
import { getHandover } from "@/features/assignments/queries";
import { handoverPdf } from "@/features/assignments/handover-pdf";

/** Handover PDF for printing and signing (staff with assignment:read). */
export async function GET(_req: Request, ctx: RouteContext<"/api/handover/[ref]">) {
  const { denied } = await authorizeRoute("assignment:read");
  if (denied) return denied;

  const { ref } = await ctx.params;
  const handover = await getHandover(ref);
  if (!handover) return Response.json({ error: "Not found" }, { status: 404 });

  const bytes = await handoverPdf(handover, process.env.COMPANY_NAME ?? "Company");
  const name = `handover-${handover.employee.employeeCode}-${handover.assignedAt.toISOString().slice(0, 10)}.pdf`;
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
