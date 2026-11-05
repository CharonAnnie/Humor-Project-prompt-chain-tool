import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getChain } from "@/lib/data/chains";
import { Card, EmptyState, PageHeader, Skeleton } from "@/app/components/ui";
import ChainSettings from "./ChainSettings";
import StepList from "./StepList";

// `params` is awaited inside the Suspense boundary rather than at the top of
// the page. With Cache Components, reading it up here would make the whole
// route request-time and nothing would prerender; this way the header ships
// from the static shell and the chain streams in behind it.
export default function ChainEditorPage(props: PageProps<"/chains/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <Editor params={props.params} />
    </Suspense>
  );
}

async function Editor({
  params,
}: {
  params: PageProps<"/chains/[id]">["params"];
}) {
  const { id } = await params;
  const numeric = Number(id);
  if (!Number.isInteger(numeric)) notFound();

  const data = await getChain(numeric);
  if (!data) notFound();

  const { chain, steps, models, voices, runCount } = data;
  const activeSteps = steps.filter((step) => step.is_active).length;

  return (
    <>
      <PageHeader
        title={chain.name}
        subtitle={`${steps.length} ${steps.length === 1 ? "step" : "steps"}${
          activeSteps === steps.length ? "" : `, ${activeSteps} active`
        } · runs in step order, each step reading the one before it.`}
        actions={
          <>
            <Link href="/" className="btn btn-secondary">
              All chains
            </Link>
            <Link href={`/chains/${chain.id}/media`} className="btn btn-secondary">
              Media
            </Link>
            <Link href={`/chains/${chain.id}/run`} className="btn btn-primary">
              Run chain
            </Link>
          </>
        }
      />

      <h2 className="mb-3 text-sm font-semibold tracking-tight">Steps</h2>

      {steps.length === 0 ? (
        <div className="grid gap-3">
          <EmptyState
            title="This chain has no steps."
            hint="It is defined but cannot run. Add the first one below."
          />
          <StepList chainId={chain.id} steps={[]} models={models} />
        </div>
      ) : (
        <StepList chainId={chain.id} steps={steps} models={models} />
      )}

      <h2 className="mt-10 mb-3 text-sm font-semibold tracking-tight">
        Chain settings
      </h2>
      <Card>
        <ChainSettings chain={chain} voices={voices} runCount={runCount} />
      </Card>
    </>
  );
}
