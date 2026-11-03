import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Boxes, History, QrCode, ShieldCheck } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentUser, homePathFor } from "@/lib/auth/dal";
import { LoginForm } from "@/features/auth/login-form";

export const metadata = { title: "Sign in" };

const POINTS = [
  { icon: Boxes, title: "One inventory", text: "Every laptop, phone, card and licence with its status and value." },
  { icon: History, title: "Full custody trail", text: "Who had what, when, and in what condition it came back." },
  { icon: QrCode, title: "Scan to look up", text: "Printable QR labels open the asset record instantly." },
  { icon: ShieldCheck, title: "Role-based access", text: "IT, HR and employees each see exactly what they need." },
];

export default function LoginPage() {
  return (
    <div className="grid min-h-svh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-[oklch(0.22_0.03_265)] p-12 text-white lg:flex lg:flex-col">
        {/* Faint grid for texture; purely decorative. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(to_right,white_1px,transparent_1px),linear-gradient(to_bottom,white_1px,transparent_1px)] [background-size:40px_40px] [mask-image:radial-gradient(ellipse_at_30%_20%,black,transparent_75%)]"
        />
        <div className="relative flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary">
            <Boxes className="size-5" />
          </div>
          <span className="text-lg font-semibold tracking-tight">EAMS</span>
        </div>
        <div className="relative mt-auto max-w-md space-y-8">
          <div className="space-y-3">
            <h1 className="text-3xl leading-tight font-semibold tracking-tight">Know where every company asset is, and who has it.</h1>
            <p className="text-white/65">Enterprise Asset Management for IT, HR and every employee.</p>
          </div>
          <ul className="grid gap-5 sm:grid-cols-2">
            {POINTS.map((p) => (
              <li key={p.title} className="space-y-1.5">
                <p.icon className="size-5 text-[oklch(0.75_0.12_262)]" />
                <div className="text-sm font-medium">{p.title}</div>
                <div className="text-sm leading-snug text-white/60">{p.text}</div>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <main className="flex items-center justify-center bg-background px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm space-y-8">
          <div className="flex items-center gap-2 lg:hidden">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Boxes className="size-5" />
            </div>
            <span className="text-lg font-semibold tracking-tight">EAMS</span>
          </div>
          <div className="space-y-1.5">
            <h2 className="text-2xl font-semibold tracking-tight">Welcome back</h2>
            <p className="text-sm text-muted-foreground">Sign in with your company email and password.</p>
          </div>
          <Suspense fallback={<FormSkeleton />}>
            <RedirectIfSignedIn />
            <LoginForm />
          </Suspense>
          <p className="text-xs text-muted-foreground">Forgot your password? Ask your IT administrator to reset it.</p>
        </div>
      </main>
    </div>
  );
}

async function RedirectIfSignedIn() {
  const user = await getCurrentUser();
  if (user) redirect(homePathFor(user));
  return null;
}

function FormSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-9 w-full" />
    </div>
  );
}
