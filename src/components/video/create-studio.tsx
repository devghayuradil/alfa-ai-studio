"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertCircle,
  ChevronDown,
  FlaskConical,
  Image as ImageIcon,
  Loader2,
  Shuffle,
  Sparkles,
  Type,
  Wand2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type BaseSyntheticEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { AspectIcon } from "@/components/video/aspect-icon";
import { OptionField, Segmented, ToggleRow } from "@/components/video/generation-options";
import { ImageDropzone, type UploadedImage } from "@/components/video/image-dropzone";
import { PreviewStage } from "@/components/video/preview-stage";
import { RecentGenerations } from "@/components/video/recent-generations";
import { useAppConfig } from "@/hooks/use-app-config";
import { useGenerationPoll } from "@/hooks/use-generation-poll";
import { usePreferences } from "@/hooks/use-preferences";
import { api, ApiError } from "@/lib/client/api";
import { checkCapabilities, type CreateVideoInput } from "@/lib/validations/video";
import { aspectRatiosFor, getCapabilities, type ModelCapabilities, supportsMode } from "@/lib/video/capabilities";
import { cn } from "@/lib/utils";
import type { PublicAppConfig } from "@/types/config";
import {
  ASPECT_RATIOS,
  type AspectRatio,
  GENERATION_MODES,
  type GenerationDTO,
  type GenerationMode,
  isTerminalStatus,
  RESOLUTIONS,
} from "@/types/video";

const ACTIVE_KEY = "alfa-ai-studio:active-generation";

const PROMPT_IDEAS = [
  "Cinematic drone shot gliding over a misty pine forest at sunrise, golden light breaking through the fog, slow push forward",
  "Close-up of a barista pouring latte art in slow motion, warm café lighting, shallow depth of field",
  "A neon-lit cyberpunk street in the rain at night, reflections on wet asphalt, camera tracking a person with a glowing umbrella",
  "Macro shot of a hummingbird hovering near a vivid pink flower, wings in slow motion, soft bokeh background",
  "Astronaut walking across a red desert planet, two moons in the sky, dust swirling, wide anamorphic shot",
];

const formSchema = z.object({
  mode: z.enum(GENERATION_MODES),
  prompt: z
    .string()
    .trim()
    .min(3, "Describe your video in at least 3 characters")
    .max(2000, "Prompt must be 2000 characters or fewer"),
  model: z.string().min(1, "Choose a model"),
  duration: z.number().int(),
  aspectRatio: z.enum(ASPECT_RATIOS),
  resolution: z.enum(RESOLUTIONS),
  watermark: z.boolean(),
  generateAudio: z.boolean(),
  cameraFixed: z.boolean(),
  seed: z.number().int("Seed must be a whole number").min(-1).max(4_294_967_295).optional(),
});

type FormValues = z.infer<typeof formSchema>;

const ERROR_TITLES: Record<string, string> = {
  MODEL_NOT_OPEN: "Model not activated",
  MODEL_NOT_FOUND: "Model not found",
  AUTH_ERROR: "API key rejected",
  CONFIG_ERROR: "Provider not configured",
  RATE_LIMITED: "Slow down",
  QUOTA_EXCEEDED: "Quota exhausted",
  CONTENT_REJECTED: "Content rejected",
  UNSUPPORTED_FEATURE: "Not supported by this model",
  VALIDATION_ERROR: "Check your input",
  NETWORK_ERROR: "Network error",
  PROVIDER_TIMEOUT: "Provider timed out",
  PROVIDER_UNAVAILABLE: "Provider unavailable",
};

function defaultValues(config: PublicAppConfig): FormValues {
  const caps = getCapabilities(config.defaultModel);
  const mode: GenerationMode = caps.textToVideo ? "text-to-video" : "image-to-video";
  const ratios = aspectRatiosFor(caps, mode);
  return {
    mode,
    prompt: "",
    model: config.defaultModel,
    duration: caps.defaultDuration,
    aspectRatio: ratios.includes("16:9") ? "16:9" : (ratios[0] ?? "16:9"),
    resolution: caps.defaultResolution,
    watermark: false,
    generateAudio: false,
    cameraFixed: false,
    seed: undefined,
  };
}

function rememberActive(id: string | null) {
  try {
    if (id) window.localStorage.setItem(ACTIVE_KEY, id);
    else window.localStorage.removeItem(ACTIVE_KEY);
  } catch {
    // ignore
  }
}

export function CreateStudio() {
  const { config, error } = useAppConfig();

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle />
        <AlertTitle>Could not load the studio</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }
  if (!config) return <StudioSkeleton />;
  return <Studio config={config} />;
}

function Studio({ config }: { config: PublicAppConfig }) {
  const router = useRouter();
  const [preferences] = usePreferences();
  const [active, setActive] = useState<GenerationDTO | null>(null);
  const [recent, setRecent] = useState<GenerationDTO[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploadsBusy, setUploadsBusy] = useState(0);
  const [firstFrame, setFirstFrame] = useState<UploadedImage | null>(null);
  const [lastFrame, setLastFrame] = useState<UploadedImage | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const submittingRef = useRef(false);
  const pendingRequestId = useRef<string | null>(null);
  const activeStatusRef = useRef<string | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultValues(config),
    mode: "onSubmit",
  });
  const { control, register, setValue, getValues, handleSubmit, setError, formState } = form;
  const values = useWatch({ control }) as FormValues;
  const caps = useMemo(() => getCapabilities(values.model), [values.model]);
  const ratios = aspectRatiosFor(caps, values.mode);
  const modelOption = config.models.find((m) => m.id === values.model);

  // Restore the last active generation (survives page refresh) and load recents.
  useEffect(() => {
    const controller = new AbortController();
    let storedId: string | null = null;
    try {
      storedId = window.localStorage.getItem(ACTIVE_KEY);
    } catch {
      storedId = null;
    }
    if (storedId) {
      api
        .getGeneration(storedId, controller.signal)
        .then((generation) => {
          activeStatusRef.current = generation.status;
          setActive(generation);
        })
        .catch(() => {
          if (!controller.signal.aborted) rememberActive(null);
        });
    }
    api
      .listGenerations(12, controller.signal)
      .then(setRecent)
      .catch(() => undefined)
      .finally(() => {
        if (!controller.signal.aborted) setRecentLoading(false);
      });
    return () => controller.abort();
  }, []);

  const handleUpdate = useCallback((generation: GenerationDTO) => {
    const previous = activeStatusRef.current;
    activeStatusRef.current = generation.status;
    setActive((current) => (current && current.id === generation.id ? generation : current));
    setRecent((items) => items.map((item) => (item.id === generation.id ? generation : item)));
    if (previous && previous !== generation.status && isTerminalStatus(generation.status)) {
      if (generation.status === "succeeded") {
        toast.success("Video ready", {
          description: generation.isDemo ? "Mock Mode returned the labeled demo clip." : "Your generation is complete.",
        });
      } else {
        toast.error("Generation failed", { description: generation.error?.message });
      }
    }
  }, []);

  const pollOptions = config.polling;
  const poll = useGenerationPoll(active, pollOptions, handleUpdate);

  function selectGeneration(generation: GenerationDTO) {
    activeStatusRef.current = generation.status;
    setActive(generation);
    rememberActive(generation.id);
  }

  function normalizeFor(nextCaps: ModelCapabilities, mode: GenerationMode) {
    const nextRatios = aspectRatiosFor(nextCaps, mode);
    if (!nextCaps.durations.includes(getValues("duration"))) setValue("duration", nextCaps.defaultDuration);
    if (nextRatios.length && !nextRatios.includes(getValues("aspectRatio"))) {
      setValue("aspectRatio", nextRatios.includes("16:9") ? "16:9" : nextRatios[0]);
    }
    if (!nextCaps.resolutions.includes(getValues("resolution"))) setValue("resolution", nextCaps.defaultResolution);
    if (!nextCaps.audio) setValue("generateAudio", false);
    if (!nextCaps.cameraFixed) setValue("cameraFixed", false);
    if (!nextCaps.watermark) setValue("watermark", false);
    if (!nextCaps.seed) setValue("seed", undefined);
    if (!nextCaps.imageToVideo.lastFrame && lastFrame) {
      URL.revokeObjectURL(lastFrame.previewUrl);
      setLastFrame(null);
    }
  }

  function changeModel(modelId: string) {
    const nextCaps = getCapabilities(modelId);
    let mode = getValues("mode");
    if (!supportsMode(nextCaps, mode)) mode = nextCaps.textToVideo ? "text-to-video" : "image-to-video";
    setValue("model", modelId);
    setValue("mode", mode);
    normalizeFor(nextCaps, mode);
  }

  function changeMode(mode: GenerationMode) {
    setValue("mode", mode);
    normalizeFor(caps, mode);
  }

  const buildInput = (data: FormValues, clientRequestId: string): CreateVideoInput => ({
    clientRequestId,
    mode: data.mode,
    prompt: data.prompt,
    model: data.model,
    duration: data.duration,
    aspectRatio: data.aspectRatio,
    resolution: data.resolution,
    watermark: data.watermark,
    generateAudio: data.generateAudio,
    cameraFixed: data.cameraFixed,
    ...(data.seed !== undefined ? { seed: data.seed } : {}),
    ...(data.mode === "image-to-video" && firstFrame ? { firstFrameId: firstFrame.id } : {}),
    ...(data.mode === "image-to-video" && lastFrame ? { lastFrameId: lastFrame.id } : {}),
    ...(config.mockMode && preferences.simulateFailure ? { mockOutcome: "failure" as const } : {}),
  });

  async function send(input: CreateVideoInput) {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const { generation, duplicate } = await api.createGeneration(input);
      pendingRequestId.current = null;
      selectGeneration(generation);
      setRecent((items) => [generation, ...items.filter((item) => item.id !== generation.id)]);
      // On small screens the preview sits below the form; bring it into view.
      if (window.matchMedia("(max-width: 1023px)").matches) {
        previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      if (duplicate) {
        toast.info("Already submitted", { description: "Showing the existing task instead of starting a new one." });
      } else {
        toast.success("Generation started", {
          description: config.mockMode ? "Mock Mode — simulating the task." : "Task submitted to BytePlus.",
        });
      }
    } catch (err) {
      const apiError = err instanceof ApiError ? err : null;
      // Keep the request ID on retryable failures so a retry is de-duplicated server-side.
      if (!apiError?.retryable) pendingRequestId.current = null;
      for (const issue of apiError?.issues ?? []) {
        if (issue.field in formSchema.shape) {
          setError(issue.field as keyof FormValues, { message: issue.message });
        }
      }
      toast.error(ERROR_TITLES[apiError?.code ?? ""] ?? "Could not start generation", {
        description: apiError?.message ?? "Unexpected error.",
        ...(apiError && ["MODEL_NOT_OPEN", "MODEL_NOT_FOUND", "AUTH_ERROR", "CONFIG_ERROR"].includes(apiError.code)
          ? { action: { label: "Settings", onClick: () => router.push("/settings") } }
          : {}),
        duration: 8000,
      });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  async function submitValues(data: FormValues) {
    const issues = checkCapabilities(
      {
        ...data,
        firstFrameId: data.mode === "image-to-video" ? firstFrame?.id : undefined,
        lastFrameId: data.mode === "image-to-video" ? lastFrame?.id : undefined,
      },
      getCapabilities(data.model),
    );
    if (issues.length) {
      toast.error("Not supported by this model", { description: issues[0].message });
      return;
    }
    pendingRequestId.current ??= crypto.randomUUID();
    await send(buildInput(data, pendingRequestId.current));
  }

  const onSubmit = (event?: BaseSyntheticEvent) => handleSubmit(submitValues)(event);

  function retry(generation: GenerationDTO) {
    void send({
      clientRequestId: crypto.randomUUID(),
      mode: generation.mode,
      prompt: generation.prompt,
      model: generation.model,
      duration: generation.duration,
      aspectRatio: generation.aspectRatio,
      resolution: generation.resolution,
      watermark: generation.watermark,
      generateAudio: generation.generateAudio,
      cameraFixed: generation.cameraFixed,
      ...(generation.seed !== undefined ? { seed: generation.seed } : {}),
      ...(generation.firstFrameId ? { firstFrameId: generation.firstFrameId } : {}),
      ...(generation.lastFrameId ? { lastFrameId: generation.lastFrameId } : {}),
      ...(config.mockMode && preferences.simulateFailure ? { mockOutcome: "failure" as const } : {}),
    });
  }

  const liveIssues = checkCapabilities(
    {
      ...values,
      firstFrameId: values.mode === "image-to-video" ? firstFrame?.id : undefined,
      lastFrameId: values.mode === "image-to-video" ? lastFrame?.id : undefined,
    },
    caps,
  ).filter((issue) => issue.field !== "firstFrameId");
  const needsFirstFrame = values.mode === "image-to-video" && !firstFrame;
  const promptLength = values.prompt?.length ?? 0;
  const inFlight = active !== null && !isTerminalStatus(active.status);
  const canSubmit = !submitting && uploadsBusy === 0 && liveIssues.length === 0 && !needsFirstFrame;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Create Video"
        description="Turn a prompt — or a reference image — into a short video clip with Seedance."
        actions={
          config.mockMode ? (
            <Badge variant="warning" className="px-2.5 py-1 text-xs">
              <FlaskConical /> Mock Mode · no charges
            </Badge>
          ) : null
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(360px,440px)_minmax(0,1fr)] xl:grid-cols-[460px_minmax(0,1fr)]">
        <form
          onSubmit={onSubmit}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && canSubmit) void onSubmit();
          }}
          className="flex flex-col gap-4"
          noValidate
        >
          <Tabs value={values.mode} onValueChange={(mode) => changeMode(mode as GenerationMode)}>
            <TabsList className="w-full">
              <TabsTrigger value="text-to-video" disabled={!caps.textToVideo}>
                <Type /> Text to Video
              </TabsTrigger>
              <TabsTrigger value="image-to-video" disabled={!caps.imageToVideo.firstFrame}>
                <ImageIcon /> Image to Video
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <Card className="gap-3 py-4">
            <CardHeader className="px-4">
              <CardTitle className="flex items-center gap-2">
                <Wand2 className="size-4 text-primary" /> Prompt
              </CardTitle>
              <CardDescription>Describe subject, motion, camera and mood.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2.5 px-4">
              <Textarea
                {...register("prompt")}
                rows={5}
                maxLength={config.limits.promptMaxLength}
                placeholder="A golden retriever running along a beach at sunset, slow motion, low-angle tracking shot…"
                className="max-h-72 min-h-32 resize-none text-[14px] leading-relaxed"
                aria-invalid={Boolean(formState.errors.prompt)}
              />
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() => {
                    const current = getValues("prompt");
                    const options = PROMPT_IDEAS.filter((idea) => idea !== current);
                    setValue("prompt", options[Math.floor(Math.random() * options.length)], { shouldValidate: true });
                  }}
                >
                  <Shuffle className="size-3.5" /> Inspire me
                </button>
                <span
                  className={cn(
                    "text-[11px] text-muted-foreground tabular-nums",
                    promptLength > config.limits.promptMaxLength * 0.9 && "text-warning",
                  )}
                >
                  {promptLength}/{config.limits.promptMaxLength}
                </span>
              </div>
              {formState.errors.prompt && (
                <p className="text-[11.5px] text-destructive">{formState.errors.prompt.message}</p>
              )}
              {config.mockMode && (
                <p className="text-[11px] text-muted-foreground/80">
                  Tip: include <code className="rounded bg-white/[0.06] px-1 font-mono">{config.mock.failKeyword}</code> in
                  the prompt to simulate a failed task.
                </p>
              )}
            </CardContent>
          </Card>

          {values.mode === "image-to-video" && (
            <Card className="gap-3 py-4">
              <CardHeader className="px-4">
                <CardTitle className="flex items-center gap-2">
                  <ImageIcon className="size-4 text-primary" /> Reference images
                </CardTitle>
                <CardDescription>
                  PNG, JPEG or WebP · up to {config.limits.maxImageBytes / 1024 / 1024} MB · {config.limits.minImageSide}–
                  {config.limits.maxImageSide}px per side
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 px-4">
                <ImageDropzone
                  label="First frame"
                  hint="Video starts here"
                  value={firstFrame}
                  onChange={setFirstFrame}
                  onBusyChange={(busy) => setUploadsBusy((n) => Math.max(0, n + (busy ? 1 : -1)))}
                  limits={config.limits}
                />
                <ImageDropzone
                  label="Last frame"
                  hint="Video ends here"
                  optional
                  value={lastFrame}
                  onChange={setLastFrame}
                  onBusyChange={(busy) => setUploadsBusy((n) => Math.max(0, n + (busy ? 1 : -1)))}
                  limits={config.limits}
                  disabled={!caps.imageToVideo.lastFrame || !firstFrame}
                  disabledReason={
                    !caps.imageToVideo.lastFrame ? `${caps.label} doesn't support last-frame input` : "Add a first frame first"
                  }
                />
              </CardContent>
            </Card>
          )}

          <Card className="gap-4 py-4">
            <CardHeader className="px-4">
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="size-4 text-primary" /> Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 px-4">
              <OptionField label="Model" hint="Only options supported by the selected model are shown.">
                <Select value={values.model} onValueChange={changeModel}>
                  <SelectTrigger className="h-auto min-h-10 py-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {config.models.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        <span className="flex flex-col items-start gap-0.5">
                          <span className="font-medium">{model.capabilities.label}</span>
                          <span className="font-mono text-[10.5px] text-muted-foreground">{model.id}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                  {caps.description}
                  {modelOption?.availability === "not_open" && (
                    <span className="mt-1 block text-destructive">Not activated in your BytePlus account (ModelNotOpen).</span>
                  )}
                </p>
              </OptionField>

              <OptionField label="Duration">
                <Controller
                  control={control}
                  name="duration"
                  render={({ field }) => (
                    <Segmented
                      ariaLabel="Duration"
                      value={String(field.value)}
                      onChange={(value) => field.onChange(Number(value))}
                      options={caps.durations.map((d) => ({ value: String(d), label: `${d}s` }))}
                    />
                  )}
                />
              </OptionField>

              <OptionField
                label="Aspect ratio"
                hint={values.mode === "image-to-video" ? "Adaptive follows the first frame's aspect ratio." : undefined}
              >
                <Controller
                  control={control}
                  name="aspectRatio"
                  render={({ field }) => (
                    <Segmented<AspectRatio>
                      ariaLabel="Aspect ratio"
                      value={field.value}
                      onChange={field.onChange}
                      options={ratios.map((ratio) => ({
                        value: ratio,
                        label: (
                          <>
                            <AspectIcon ratio={ratio} />
                            {ratio === "adaptive" ? "Auto" : ratio}
                          </>
                        ),
                      }))}
                    />
                  )}
                />
              </OptionField>

              <OptionField label="Resolution">
                <Controller
                  control={control}
                  name="resolution"
                  render={({ field }) => (
                    <Segmented
                      ariaLabel="Resolution"
                      value={field.value}
                      onChange={field.onChange}
                      options={caps.resolutions.map((r) => ({ value: r, label: r }))}
                    />
                  )}
                />
              </OptionField>

              <div className="flex flex-col gap-3 rounded-xl border bg-white/[0.015] p-3">
                {caps.audio && (
                  <Controller
                    control={control}
                    name="generateAudio"
                    render={({ field }) => (
                      <ToggleRow
                        id="generate-audio"
                        label="Generate audio"
                        description="Synchronized sound track. May cost more."
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    )}
                  />
                )}
                {caps.watermark && (
                  <Controller
                    control={control}
                    name="watermark"
                    render={({ field }) => (
                      <ToggleRow
                        id="watermark"
                        label="Watermark"
                        description="Add the provider's AI-generated watermark."
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    )}
                  />
                )}
                {caps.cameraFixed && (
                  <Controller
                    control={control}
                    name="cameraFixed"
                    render={({ field }) => (
                      <ToggleRow
                        id="camera-fixed"
                        label="Fixed camera"
                        description="Keep the camera still; only the subject moves."
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    )}
                  />
                )}
              </div>

              {caps.seed && (
                <div>
                  <button
                    type="button"
                    onClick={() => setShowAdvanced((v) => !v)}
                    className="inline-flex cursor-pointer items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    aria-expanded={showAdvanced}
                  >
                    <ChevronDown className={cn("size-3.5 transition-transform", showAdvanced && "rotate-180")} />
                    Advanced
                  </button>
                  {showAdvanced && (
                    <div className="mt-3">
                      <OptionField label="Seed" hint="Same seed + same settings gives similar results. Leave empty for random.">
                        <Input
                          inputMode="numeric"
                          placeholder="Random"
                          aria-invalid={Boolean(formState.errors.seed)}
                          {...register("seed", {
                            setValueAs: (value: string) =>
                              value === "" || value === undefined || value === null ? undefined : Number(value),
                          })}
                        />
                        {formState.errors.seed && (
                          <p className="text-[11.5px] text-destructive">{formState.errors.seed.message}</p>
                        )}
                      </OptionField>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {liveIssues.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertTitle>Unsupported combination</AlertTitle>
              <AlertDescription>
                {liveIssues.map((issue) => (
                  <p key={`${issue.field}-${issue.message}`}>{issue.message}</p>
                ))}
              </AlertDescription>
            </Alert>
          )}

          <div className="sticky bottom-3 z-10 lg:static">
            <Button type="submit" variant="brand" size="lg" className="w-full" disabled={!canSubmit}>
              {submitting ? (
                <>
                  <Loader2 className="animate-spin" /> Submitting…
                </>
              ) : (
                <>
                  <Sparkles /> {inFlight ? "Generate another" : "Generate video"}
                </>
              )}
            </Button>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              {needsFirstFrame
                ? "Upload a first-frame image to continue"
                : `${values.duration}s · ${values.aspectRatio === "adaptive" ? "Adaptive" : values.aspectRatio} · ${values.resolution}${
                    values.generateAudio ? " · audio" : ""
                  } · ${config.mockMode ? "Mock — free" : "BytePlus — billed"}`}
              <span className="hidden sm:inline"> · ⌘/Ctrl + Enter</span>
            </p>
          </div>
        </form>

        <div ref={previewRef} className="flex min-w-0 scroll-mt-20 flex-col gap-6 lg:sticky lg:top-8">
          <Card className="gap-0 py-0">
            <CardContent className="p-4 sm:p-5">
              <PreviewStage
                generation={active}
                submitting={submitting && !active}
                pollState={poll.state}
                pollWarning={poll.warning}
                mockMode={config.mockMode}
                onResume={poll.resume}
                onRetry={() => active && retry(active)}
              />
            </CardContent>
          </Card>
          <RecentGenerations
            generations={recent}
            loading={recentLoading}
            activeId={active?.id ?? null}
            onSelect={selectGeneration}
          />
        </div>
      </div>
    </div>
  );
}

function StudioSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[440px_1fr]">
        <div className="space-y-4">
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-56 w-full rounded-2xl" />
          <Skeleton className="h-80 w-full rounded-2xl" />
        </div>
        <Skeleton className="aspect-video w-full rounded-2xl" />
      </div>
    </div>
  );
}
