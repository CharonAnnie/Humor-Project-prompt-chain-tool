import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSuperadmin } from "@/lib/auth/dal";
import { getRunnableChain, listSeedImages } from "@/lib/data/chains";
import { Card, EmptyState, PageHeader, Skeleton } from "@/app/components/ui";
import RunLauncher from "./RunLauncher";

// `startRun` uploads an image row and creates the run; no model call happens
// here, but the Storage round trip deserves more than the default budget.
export const maxDuration = 60;

export default function RunPage(props: PageProps<"/chains/[id]/run">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Launcher params={props.params} />
    </Suspense>
  );
}

async function Launcher({
  params,
}: {
  params: PageProps<"/chains/[id]/run">["params"];
}) {
  const { id } = await params;
  const numeric = Number(id);
  if (!Number.isInteger(numeric)) notFound();

  const [data, admin, images] = await Promise.all([
    getRunnableChain(numeric),
    requireSuperadmin(),
    listSeedImages(),
  ]);

  if (!data) notFound();

  const { chain, steps, models } = data;

  if (steps.length === 0) {
    return (
      <>
        <PageHeader
          title={`Run ${chain.name}`}
          actions={
            <Link href={`/chains/${chain.id}`} className="btn btn-secondary">
              Edit chain
            </Link>
          }
        />
        <EmptyState
          title="This chain has no active steps."
          hint="Add a step, or reactivate one, and it becomes runnable."
        />
      </>
    );
  }

  const firstModel = models.find((model) => model.id === steps[0].model_id);

  return (
    <>
      <PageHeader
        title={`Run ${chain.name}`}
        subtitle={`${steps.length} ${steps.length === 1 ? "step" : "steps"}: ${steps
          .map((step) => step.name)
          .join(" → ")}`}
        actions={
          <>
            <Link href={`/chains/${chain.id}`} className="btn btn-secondary">
              Edit chain
            </Link>
            <Link href={`/chains/${chain.id}/media`} className="btn btn-secondary">
              Past runs
            </Link>
          </>
        }
      />

      <Card>
        <RunLauncher
          chainId={chain.id}
          adminId={admin.id}
          images={images}
          firstStepReadsImage={firstModel?.supportsVision ?? false}
          imageBaseUrl={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/images`}
        />
      </Card>

      <Card className="mt-6">
        <p className="label mb-2">What will happen</p>
        <ol className="grid gap-1.5 text-sm">
          {steps.map((step, index) => {
            const model = models.find((candidate) => candidate.id === step.model_id);
            return (
              <li key={step.id} className="flex flex-wrap items-center gap-2">
                <span
                  className="flex size-5 items-center justify-center rounded text-xs tabular-nums"
                  style={{ background: "var(--surface-2)" }}
                >
                  {index + 1}
                </span>
                <span>{step.name}</span>
                <span className="badge">{model?.slug ?? "no model"}</span>
                {step.temperature !== null && (
                  <span className="badge">temp {step.temperature}</span>
                )}
                {index === 0 ? (
                  <span className="text-xs" style={{ color: "var(--muted)" }}>
                    reads the seed
                  </span>
                ) : (
                  <span className="text-xs" style={{ color: "var(--muted)" }}>
                    reads step {index}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </Card>
    </>
  );
}
