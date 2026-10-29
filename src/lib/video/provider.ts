import type { ProviderName, VideoRequest, VideoTask } from "@/types/video";

/**
 * Contract every video backend implements. Routes and services only talk to
 * this interface, so adding a provider never touches UI or API code.
 *
 * Implementations throw `AppError` for request-level failures (bad config,
 * auth, model access, rate limits). A task that the provider accepted but
 * later failed is reported as `status: "failed"` with `error` set.
 */
export interface VideoProvider {
  readonly name: ProviderName;
  createTask(input: VideoRequest): Promise<VideoTask>;
  getTask(id: string): Promise<VideoTask>;
}
