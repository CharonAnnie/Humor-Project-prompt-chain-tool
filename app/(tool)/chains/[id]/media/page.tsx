import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getChain, imageUrl, listRuns } from "@/lib/data/chains";
import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  Skeleton,
  formatDateTime,
} from "@/app/components/ui";

/**
 * The media this chain has produced: every run, newest first.
 *
 * Scoped to one chain rather than being a global list, because the question
 * this screen answers is "what does this chain actually make" -- which is the
 * question you have when deciding whether to change its prompts.
 */
export default function ChainMediaPage(props: PageProps<"/chains/[id]/media">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Media params={props.params} />
    </Suspense>
  );
}

async function Media({
  params,
}: {
  params: PageProps<"/chains/[id]/media">["params"];
}) {
  const { id } = await params;
  const numeric = Number(id);
  if (!Number.isInteger(numeric)) notFound();

  const [chain, runs] = await Promise.all([getChain(numeric), listRuns(numeric)]);
  if (!chain) notFound();

  return (
    <>
      <PageHeader
        title={`Media from ${chain.chain.name}`}
        subtitle={
          runs.length === 0
            ? undefined
            : `${runs.length} ${runs.length === 1 ? "run" : "runs"}, newest first.`
        }
        actions={
          <>
            <Link href={`/chains/${numeric}`} className="btn btn-secondary">
              Edit chain
            </Link>
            <Link href={`/chains/${numeric}/run`} className="btn btn-primary">
              Run chain
            </Link>
          </>
        }
      />

      {runs.length === 0 ? (
        <EmptyState
          title="This chain has not produced anything yet."
          hint="Run it once and the output, every step's prompt and the model calls behind them show up here."
        />
      ) : (
        <div className="grid gap-3">
          {runs.map(({ run, storagePath, stepsRecorded }) => (
            <Card key={run.id} className="!p-4">
              <div className="flex flex-wrap items-start gap-4">
                {storagePath && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imageUrl(storagePath)}
                    alt=""
                    loading="lazy"
                    className="size-20 shrink-0 rounded-lg object-cover"
                    style={{ background: "var(--surface-2)" }}
                  />
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/chains/${numeric}/media/${run.id}`}
                      className="text-sm font-medium hover:underline"
                    >
                      {formatDateTime(run.created_at)}
                    </Link>
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
                      {stepsRecorded} {stepsRecorded === 1 ? "call" : "calls"}
                    </Badge>
                    {run.generation_id && <Badge tone="positive">published</Badge>}
                    {run.latency_ms !== null && (
                      <Badge>{(run.latency_ms / 1000).toFixed(1)}s</Badge>
                    )}
                  </div>

                  {run.final_output && (
                    <p className="mt-1.5 line-clamp-3 text-sm">{run.final_output}</p>
                  )}

                  {run.error_message && (
                    <p className="mt-1.5 text-sm" style={{ color: "var(--negative)" }}>
                      {run.error_message}
                    </p>
                  )}

                  {!run.image_id && run.seed_input && (
                    <p
                      className="mt-1.5 line-clamp-2 text-xs"
                      style={{ color: "var(--muted)" }}
                    >
                      Seed: {run.seed_input}
                    </p>
                  )}
                </div>

                <Link
                  href={`/chains/${numeric}/media/${run.id}`}
                  className="btn btn-secondary shrink-0"
                >
                  Open
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
