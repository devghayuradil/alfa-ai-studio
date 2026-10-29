"use client";

import {
  AlertTriangle,
  Check,
  Database,
  FlaskConical,
  HardDrive,
  KeyRound,
  Minus,
  Server,
  ShieldCheck,
  Zap,
} from "lucide-react";
import type { ReactNode } from "react";

import { AVAILABILITY } from "@/components/layout/provider-status";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useAppConfig } from "@/hooks/use-app-config";
import { usePreferences } from "@/hooks/use-preferences";
import { formatBytes } from "@/lib/client/format";
import { cn } from "@/lib/utils";
import type { PublicAppConfig } from "@/types/config";

export function SettingsView() {
  const { config, error } = useAppConfig();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Settings"
        description="Provider, models and storage are configured on the server through environment variables. Secrets are never sent to the browser."
      />
      {error && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Could not load configuration</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {!config && !error ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-56 rounded-2xl" />
          ))}
        </div>
      ) : config ? (
        <SettingsContent config={config} />
      ) : null}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/[0.05] py-2.5 text-[13px] last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right">{children}</span>
    </div>
  );
}

function Flag({ on }: { on: boolean }) {
  return on ? (
    <Check className="mx-auto size-4 text-success" aria-label="Supported" />
  ) : (
    <Minus className="mx-auto size-4 text-muted-foreground/50" aria-label="Not supported" />
  );
}

function SettingsContent({ config }: { config: PublicAppConfig }) {
  const [preferences, setPreferences] = usePreferences();

  return (
    <div className="flex flex-col gap-4">
      {config.warnings.map((warning) => (
        <Alert key={warning} variant="warning">
          <AlertTriangle />
          <AlertTitle>Configuration warning</AlertTitle>
          <AlertDescription>{warning}</AlertDescription>
        </Alert>
      ))}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="size-4 text-primary" /> Video provider
            </CardTitle>
            <CardDescription>Selected by VIDEO_PROVIDER. The app never switches providers automatically.</CardDescription>
          </CardHeader>
          <CardContent>
            <Row label="Mode">
              {config.mockMode ? (
                <Badge variant="warning">
                  <FlaskConical /> Mock Mode
                </Badge>
              ) : (
                <Badge variant="success">
                  <Zap /> BytePlus ModelArk
                </Badge>
              )}
            </Row>
            <Row label="API key">
              {config.apiKeyConfigured ? (
                <span className="inline-flex items-center gap-1.5 text-success">
                  <ShieldCheck className="size-3.5" /> Configured (hidden)
                </span>
              ) : (
                <span className="text-muted-foreground">Not set</span>
              )}
            </Row>
            <Row label="Base URL">
              <span className="font-mono text-[11.5px]" title={config.baseUrl}>
                {config.baseUrl}
              </span>
            </Row>
            <Row label="Default model">
              <span className="font-mono text-[11.5px]">{config.defaultModel}</span>
            </Row>
            <Row label="Status polling">
              every {config.polling.intervalMs / 1000}s → {config.polling.maxIntervalMs / 1000}s, stops after{" "}
              {config.polling.maxDurationMs / 60_000} min
            </Row>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="size-4 text-primary" /> Enable real BytePlus generation
            </CardTitle>
            <CardDescription>Do this only once your Seedance model is activated in ModelArk.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2.5 text-[13px]">
              {[
                <>Activate the Seedance model in the BytePlus ModelArk console (Model activation).</>,
                <>
                  Put your key in <code className="font-mono text-xs">.env.local</code>:{" "}
                  <code className="font-mono text-xs">ARK_API_KEY=…</code>
                </>,
                <>
                  Confirm <code className="font-mono text-xs">ARK_MODEL</code> matches the model ID shown in the console.
                </>,
                <>
                  Set <code className="font-mono text-xs">VIDEO_PROVIDER=byteplus</code> and restart the dev server.
                </>,
                <>Generate a short 5s clip first. Real generations are billed by BytePlus.</>,
              ].map((step, index) => (
                <li key={index} className="flex gap-3">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">
                    {index + 1}
                  </span>
                  <span className="leading-relaxed text-foreground/90">{step}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Models &amp; capabilities</CardTitle>
          <CardDescription>
            Enabled through ARK_MODEL and ARK_EXTRA_MODELS. The studio only offers options each model supports, and the
            server re-checks every request.
          </CardDescription>
        </CardHeader>
        <CardContent className="scrollbar-thin overflow-x-auto">
          <table className="w-full min-w-[760px] text-[12.5px]">
            <thead>
              <tr className="border-b text-left text-[11px] text-muted-foreground uppercase">
                <th className="pb-2 font-medium">Model</th>
                <th className="pb-2 text-center font-medium">Text</th>
                <th className="pb-2 text-center font-medium">First frame</th>
                <th className="pb-2 text-center font-medium">Last frame</th>
                <th className="pb-2 text-center font-medium">Audio</th>
                <th className="pb-2 font-medium">Durations</th>
                <th className="pb-2 font-medium">Resolutions</th>
                <th className="pb-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {config.models.map((model) => {
                const c = model.capabilities;
                const availability = AVAILABILITY[model.availability];
                return (
                  <tr key={model.id} className="border-b border-white/[0.05] last:border-0">
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2 font-medium">
                        {c.label}
                        {model.isDefault && <Badge variant="outline">default</Badge>}
                        {!c.recognized && <Badge variant="warning">conservative</Badge>}
                      </div>
                      <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">{model.id}</div>
                    </td>
                    <td className="py-3 text-center"><Flag on={c.textToVideo} /></td>
                    <td className="py-3 text-center"><Flag on={c.imageToVideo.firstFrame} /></td>
                    <td className="py-3 text-center"><Flag on={c.imageToVideo.lastFrame} /></td>
                    <td className="py-3 text-center"><Flag on={c.audio} /></td>
                    <td className="py-3 tabular-nums">{c.durations.join(", ")}s</td>
                    <td className="py-3">{c.resolutions.join(", ")}</td>
                    <td className="py-3">
                      <span className="inline-flex items-center gap-1.5" title={availability.hint}>
                        <span className={cn("size-1.5 rounded-full", availability.dot)} />
                        {availability.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="size-4 text-primary" /> Storage
            </CardTitle>
            <CardDescription>History uses MongoDB when MONGODB_URI is set, otherwise local JSON files.</CardDescription>
          </CardHeader>
          <CardContent>
            <Row label="Generation history">
              {config.storage.history === "mongodb" ? (
                <Badge variant="success">MongoDB</Badge>
              ) : (
                <Badge variant="secondary">
                  <HardDrive /> Local files (.data/)
                </Badge>
              )}
            </Row>
            <Row label="Reference images">
              <Badge variant="secondary">
                <HardDrive /> Local disk (.data/uploads)
              </Badge>
            </Row>
            <Row label="Accepted images">
              {config.limits.imageTypes.map((t) => t.replace("image/", "").toUpperCase()).join(", ")} · ≤{" "}
              {formatBytes(config.limits.maxImageBytes)}
            </Row>
            <Row label="Image dimensions">
              {config.limits.minImageSide}–{config.limits.maxImageSide}px per side
            </Row>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FlaskConical className="size-4 text-warning" /> Mock testing
            </CardTitle>
            <CardDescription>
              {config.mockMode
                ? "Simulated tasks return a labeled demo clip. Nothing is sent to BytePlus."
                : "Available when VIDEO_PROVIDER=mock."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between gap-4 border-b border-white/[0.05] py-2.5">
              <div>
                <label htmlFor="simulate-failure" className="cursor-pointer text-[13px]">
                  Simulate failures
                </label>
                <p className="mt-0.5 text-[11.5px] text-muted-foreground">New mock tasks fail part-way through. Stored in this browser.</p>
              </div>
              <Switch
                id="simulate-failure"
                checked={preferences.simulateFailure}
                onCheckedChange={(checked) => setPreferences({ simulateFailure: checked })}
                disabled={!config.mockMode}
              />
            </div>
            <Row label="Queued phase">{config.mock.queueMs / 1000}s</Row>
            <Row label="Running phase">{config.mock.runMs / 1000}s</Row>
            <Row label="Failure keyword">
              <code className="font-mono text-xs">{config.mock.failKeyword}</code>
            </Row>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
