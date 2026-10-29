import { describe, expect, it } from "vitest";

import { JsonDocumentStore } from "@/lib/storage/json-store";
import { MOCK_FAIL_KEYWORD, type MockTaskDocument, MockVideoProvider } from "@/lib/video/mock-provider";

import { videoRequest, withTempDir } from "./helpers/fixtures";

function setup(dir: string, clock: { now: number }) {
  return new MockVideoProvider({
    store: new JsonDocumentStore<MockTaskDocument>(dir),
    queueMs: 1_000,
    runMs: 4_000,
    now: () => clock.now,
  });
}

describe("MockVideoProvider", () => {
  it("creates unique task IDs and starts queued", () =>
    withTempDir(async (dir) => {
      const provider = setup(dir, { now: 0 });
      const a = await provider.createTask(videoRequest());
      const b = await provider.createTask(videoRequest());
      expect(a.providerTaskId).not.toBe(b.providerTaskId);
      expect(a.providerTaskId).toMatch(/^mock-/);
      expect(a.status).toBe("queued");
      expect(a.isDemo).toBe(true);
    }));

  it("transitions queued → running → succeeded with a demo video", () =>
    withTempDir(async (dir) => {
      const clock = { now: 10_000 };
      const provider = setup(dir, clock);
      const { providerTaskId } = await provider.createTask(videoRequest({ aspectRatio: "9:16" }));

      clock.now += 500;
      expect((await provider.getTask(providerTaskId)).status).toBe("queued");

      clock.now += 1_500;
      const running = await provider.getTask(providerTaskId);
      expect(running.status).toBe("running");
      expect(running.progress).toBeGreaterThan(0);
      expect(running.progress).toBeLessThan(100);
      expect(running.videoUrl).toBeUndefined();

      clock.now += 5_000;
      const done = await provider.getTask(providerTaskId);
      expect(done.status).toBe("succeeded");
      expect(done.videoUrl).toBe("/demo/demo-9x16.mp4");
      expect(done.isDemo).toBe(true);
    }));

  it("uses the 16:9 demo for adaptive aspect ratio", () =>
    withTempDir(async (dir) => {
      const clock = { now: 0 };
      const provider = setup(dir, clock);
      const { providerTaskId } = await provider.createTask(videoRequest({ aspectRatio: "adaptive" }));
      clock.now = 60_000;
      expect((await provider.getTask(providerTaskId)).videoUrl).toBe("/demo/demo-16x9.mp4");
    }));

  it.each([
    ["mockOutcome=failure", videoRequest({ mockOutcome: "failure" })],
    ["fail keyword in prompt", videoRequest({ prompt: `A test ${MOCK_FAIL_KEYWORD}` })],
  ])("simulates a failure via %s", (_label, request) =>
    withTempDir(async (dir) => {
      const clock = { now: 0 };
      const provider = setup(dir, clock);
      const { providerTaskId } = await provider.createTask(request);
      clock.now = 1_000 + 3_000; // 75% through the running phase
      const task = await provider.getTask(providerTaskId);
      expect(task.status).toBe("failed");
      expect(task.error?.providerCode).toBe("MockSimulatedFailure");
      expect(task.videoUrl).toBeUndefined();
    }));

  it("persists tasks on disk so a fresh instance (another worker) can read them", () =>
    withTempDir(async (dir) => {
      const clock = { now: 0 };
      const { providerTaskId } = await setup(dir, clock).createTask(videoRequest());
      clock.now = 60_000;
      const otherProcess = setup(dir, clock);
      expect((await otherProcess.getTask(providerTaskId)).status).toBe("succeeded");
    }));

  it("reports NOT_FOUND for unknown tasks", () =>
    withTempDir(async (dir) => {
      await expect(setup(dir, { now: 0 }).getTask("mock-missing")).rejects.toMatchObject({ code: "NOT_FOUND" });
    }));
});
