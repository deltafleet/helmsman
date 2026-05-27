export class HelmsmanAbortError extends Error {
  constructor(readonly reasonCode: "timed_out" | "aborted") {
    super(reasonCode);
  }
}

export async function sleepWithAbort(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) throw new HelmsmanAbortError("aborted");
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new HelmsmanAbortError(signal.reason === "timed_out" ? "timed_out" : "aborted"));
      },
      { once: true },
    );
  });
}
