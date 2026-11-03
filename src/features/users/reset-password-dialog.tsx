"use client";

import { useEffect, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/shared/form-fields";
import { passwordSchema } from "@/features/auth/schemas";
import { resetUserPassword } from "./actions";

const schema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords don't match" });

export function ResetPasswordDialog({
  user,
  onOpenChange,
}: {
  user: { id: string; name: string } | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [pending, startTransition] = useTransition();
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { password: "", confirm: "" },
  });

  useEffect(() => {
    if (user) form.reset({ password: "", confirm: "" });
  }, [user, form]);

  function onSubmit(values: z.infer<typeof schema>) {
    if (!user) return;
    startTransition(async () => {
      const result = await resetUserPassword({ id: user.id, password: values.password });
      if (result.ok) {
        toast.success(result.message);
        onOpenChange(false);
      } else {
        toast.error(result.error);
      }
    });
  }

  const { errors } = form.formState;

  return (
    <Dialog open={!!user} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>
            Set a new password for {user?.name}. They will be signed out of all devices.
          </DialogDescription>
        </DialogHeader>
        <form id="reset-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <Field label="New password" htmlFor="new-password" error={errors.password?.message}>
            <Input id="new-password" type="password" autoComplete="new-password" {...form.register("password")} aria-invalid={!!errors.password} />
          </Field>
          <Field label="Confirm password" htmlFor="confirm-password" error={errors.confirm?.message}>
            <Input id="confirm-password" type="password" autoComplete="new-password" {...form.register("confirm")} aria-invalid={!!errors.confirm} />
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="reset-form" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            Reset password
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
