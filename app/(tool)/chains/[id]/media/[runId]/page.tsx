import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getRun, imageUrl } from "@/lib/data/chains";
import { extractCaptions } from "@/lib/run/prompt";
import {
  Badge,
  Card,
  PageHeader,
  Skeleton,
  formatDateTime,
} from "@/app/components/ui";
import PublishButton from "./PublishButton";
import RetryButton from "./RetryButton";
import RunProgress from "./RunProgress";

// This page's Server Functions make the model calls, so the platform's default
// function budget is not enough: one step is allowed up to ~45s of attempts.
// The same 60 as Caption Drop's /create page, and for the same reason.
export const maxDuration = 60;

export default function RunPage(props: PageProps<"/chains/[id]/media/[runId]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Detail params={props.params} />
    </Suspense>
  );
}

async function Detail({
  params,
}: {
  params: PageProps<"/chains/[id]/media/[runId]">["params"];
}) {
  const { id, runId } = await params;
  const data = await getRun(runId);
  if (!data) notFound();

  const { run, chain, storagePath, responses, steps, models, captions } = data;

  const succeeded = responses.filter((response) => response.status === "succeeded");
  const activeSteps = steps.filter((step) => step.is_active);
  const captionTexts = run.final_output ? extractCaptions(run.final_output) : [];

  return (
    <>
      <PageHeader
        title={chain.name}
        subtitle={`Run of ${formatDateTime(run.created_at)}`}
        actions={
          <>
            <Link href={`/chains/${id}/media`} className="btn btn-secondary">
              All runs
            </Link>
            <Link href={`/chains/${id}/run`} className="btn btn-primary">
              Run again
            </Link>
          </>
        }
      />

      {run.status === "running" && (
        <div className="mb-6">
          <RunProgress
            runId={run.id}
            stepNames={activeSteps.map((step) => step.name)}
            completed={succeeded.length}
          />
        </div>
      )}

      <Card className="mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            tone={
              run.status === "succeeded"
                ? "positive"
                : run.status === "failed"
                  ? "negative"
                  : "warning"
            }
          >
            {run.status}
          </Badge>
          <Badge>
            {succeeded.length} of {activeSteps.length} steps
          </Badge>
          {run.input_tokens !== null && (
            <Badge>{run.input_tokens} in / {run.output_tokens} out tokens</Badge>
          )}
          {run.latency_ms !== null && (
            <Badge>{(run.latency_ms / 1000).toFixed(1)}s of model time</Badge>
          )}
          {run.generation_id && <Badge tone="positive">published</Badge>}
        </div>

        <div className="mt-4 flex flex-wrap gap-6">
          {storagePath && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl(storagePath)}
              alt="The image this run read"
              className="max-h-64 rounded-xl object-contain"
              style={{ background: "var(--surface-2)" }}
            />
          )}

          <div className="min-w-0 flex-1">
            <p className="label">Seed</p>
            <p className="mt-1 text-sm">
              {run.seed_input ? (
                run.seed_input
              ) : storagePath ? (
                <span style={{ color: "var(--muted)" }}>
                  The image alone, with no extra context.
                </span>
              ) : (
                <span style={{ color: "var(--muted)" }}>—</span>
              )}
            </p>

            {run.error_message && (
              <div className="notice-error mt-4">
                <p>{run.error_message}</p>
                {run.status === "failed" && (
                  <RetryButton runId={run.id} resumeFrom={succeeded.length + 1} />
                )}
              </div>
            )}
          </div>
        </div>
      </Card>

      <h2 className="mb-3 text-sm font-semibold tracking-tight">
        What each step sent, and what came back
      </h2>

      <div className="grid gap-4">
        {responses.map((response) => {
          const step = steps.find((candidate) => candidate.id === response.step_id);
          const model = response.model_id ? models.get(response.model_id) : null;

          return (
            <Card key={response.id}>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="flex size-6 items-center justify-center rounded-md text-xs font-semibold tabular-nums"
                  style={{ background: "var(--surface-2)" }}
                >
                  {response.step_number ?? "—"}
                </span>
                <h3 className="font-medium">{step?.name ?? "Step since deleted"}</h3>
                <Badge
                  tone={response.status === "succeeded" ? "positive" : "negative"}
                >
                  {response.status}
                </Badge>
                {model && <Badge>{model.slug}</Badge>}
                {response.temperature !== null && (
                  <Badge>temp {response.temperature}</Badge>
                )}
                {response.latency_ms !== null && (
                  <Badge>{(response.latency_ms / 1000).toFixed(1)}s</Badge>
                )}
                {response.output_tokens !== null && (
                  <Badge>{response.output_tokens} out tok</Badge>
                )}
              </div>

              {response.error_message && (
                <p className="notice-error mt-3">{response.error_message}</p>
              )}

              {response.response_text && (
                <>
                  <p className="label mt-4 mb-1.5">Output</p>
                  <pre className="pre">{response.response_text}</pre>
                </>
              )}

              {response.request_prompt && (
                <details className="mt-3">
                  <summary
                    className="cursor-pointer text-xs"
                    style={{ color: "var(--muted)" }}
                  >
                    The exact prompt this step sent
                    {response.step_number && response.step_number > 1
                      ? ", with the earlier step's output interpolated into it"
                      : ""}
                  </summary>
                  <pre className="pre mt-2">{response.request_prompt}</pre>
                </details>
              )}
            </Card>
          );
        })}

        {responses.length === 0 && run.status !== "running" && (
          <Card>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              No model call was recorded for this run.
            </p>
          </Card>
        )}
      </div>

      {run.status === "succeeded" && captionTexts.length > 0 && (
        <>
          <h2 className="mt-10 mb-3 text-sm font-semibold tracking-tight">
            What this run produced
          </h2>
          <Card>
            <ul className="grid gap-2">
              {captionTexts.map((text, index) => (
                <li
                  key={index}
                  className="rounded-lg p-3 text-sm"
                  style={{ background: "var(--surface-2)" }}
                >
                  {text}
                </li>
              ))}
            </ul>

            <div className="mt-5">
              {run.generation_id ? (
                <div>
                  <p className="text-sm">
                    Published to Caption Drop as{" "}
                    {captions.length === 1
                      ? "1 caption"
                      : `${captions.length} captions`}
                    , against generation{" "}
                    <code className="text-xs">{run.generation_id}</code>.
                  </p>
                  {captions.length > 0 && (
                    <ul className="mt-2 grid gap-1 text-xs" style={{ color: "var(--muted)" }}>
                      {captions.map((caption) => (
                        <li key={caption.id}>
                          {caption.voice ? `${caption.voice}: ` : ""}
                          {caption.text}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : run.image_id ? (
                <PublishButton runId={run.id} captionCount={captionTexts.length} />
              ) : (
                <p className="text-xs" style={{ color: "var(--muted)" }}>
                  This run started from text rather than a photo, so it cannot be
                  published as a Caption Drop caption — a caption there belongs
                  to an image.
                </p>
              )}
            </div>
          </Card>
        </>
      )}
    </>
  );
}
