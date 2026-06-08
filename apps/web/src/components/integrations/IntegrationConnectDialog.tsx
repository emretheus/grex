import type { IssueProviderType } from "@t3tools/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ISSUE_PROVIDER_AUTH_SPECS, ISSUE_PROVIDER_META } from "@t3tools/shared/integrations";
import { useEffect, useMemo, useState } from "react";

import {
  integrationConnectMutationOptions,
  invalidateIntegrationConnections,
} from "~/lib/integrationsReactQuery";
import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Spinner } from "../ui/spinner";

interface IntegrationConnectDialogProps {
  provider: IssueProviderType | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function IntegrationConnectDialog({
  provider,
  open,
  onOpenChange,
}: IntegrationConnectDialogProps) {
  const queryClient = useQueryClient();
  const spec = provider ? ISSUE_PROVIDER_AUTH_SPECS[provider] : null;
  const displayName = provider ? ISSUE_PROVIDER_META[provider].displayName : "";

  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  // Reset the form whenever a different provider's dialog opens.
  useEffect(() => {
    if (open) {
      setValues({});
      setError(null);
    }
  }, [open, provider]);

  const connectMutation = useMutation({
    ...integrationConnectMutationOptions(provider ?? "linear"),
    onSettled: () => invalidateIntegrationConnections(queryClient),
  });

  const requiredFields = useMemo(
    () => spec?.fields.filter((field) => !field.optional) ?? [],
    [spec],
  );

  const canSubmit =
    provider !== null &&
    requiredFields.every((field) => (values[field.key]?.trim().length ?? 0) > 0);

  const handleSubmit = async () => {
    if (!provider || !spec) return;
    setError(null);

    // Send only non-empty values, trimmed; the server validates against the API.
    const credentials: Record<string, string> = {};
    for (const field of spec.fields) {
      const value = values[field.key]?.trim();
      if (value) credentials[field.key] = value;
    }

    try {
      const result = await connectMutation.mutateAsync({ provider, credentials });
      if (!result.success) {
        setError(result.error ?? "Could not connect. Check your credentials and try again.");
        return;
      }
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not connect.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-md">
        <DialogHeader>
          <DialogTitle>Connect {displayName}</DialogTitle>
          <DialogDescription>
            Your credentials are stored on the server and never leave it.
          </DialogDescription>
        </DialogHeader>

        <DialogPanel className="space-y-3">
          {spec?.fields.map((field, index) => (
            <div key={field.key} className="grid gap-1.5">
              <Label htmlFor={`integration-field-${field.key}`}>
                {field.label}
                {field.optional ? (
                  <span className="text-muted-foreground ml-1 text-xs">(optional)</span>
                ) : null}
              </Label>
              <Input
                id={`integration-field-${field.key}`}
                type={field.type === "password" ? "password" : "text"}
                placeholder={field.placeholder}
                value={values[field.key] ?? ""}
                autoFocus={index === 0}
                autoComplete="off"
                onChange={(event) =>
                  setValues((prev) => ({ ...prev, [field.key]: event.target.value }))
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter" && canSubmit && !connectMutation.isPending) {
                    event.preventDefault();
                    void handleSubmit();
                  }
                }}
              />
            </div>
          ))}

          {spec?.helpSteps && spec.helpSteps.length > 0 ? (
            <div className="bg-muted/40 border-border/70 rounded-md border border-dashed p-2.5">
              <ol className="text-muted-foreground list-decimal space-y-0.5 pl-4 text-xs leading-snug">
                {spec.helpSteps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              {spec.helpUrl ? (
                <a
                  href={spec.helpUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary mt-1.5 inline-block text-xs underline"
                >
                  Open setup page
                </a>
              ) : null}
            </div>
          ) : null}

          {error ? (
            <p className={cn("text-destructive text-xs")} role="alert">
              {error}
            </p>
          ) : null}
        </DialogPanel>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!canSubmit || connectMutation.isPending}
            onClick={() => void handleSubmit()}
          >
            {connectMutation.isPending ? <Spinner className="size-4" /> : null}
            Connect
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
