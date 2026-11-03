import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";

export const metadata = { title: "Access denied" };

export default function Forbidden() {
  return (
    <EmptyState
      icon={ShieldAlert}
      title="You don't have access to this page"
      description="Your role doesn't include the permission this page needs. If you think this is a mistake, ask a Super Admin to update your role."
      action={
        <Link href="/" className={buttonVariants({ variant: "outline" })}>
          Go to my home page
        </Link>
      }
    />
  );
}
