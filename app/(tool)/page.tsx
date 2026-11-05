import { Suspense } from "react";
import Link from "next/link";
import { listChains } from "@/lib/data/chains";
import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  Skeleton,
  formatDateTime,
} from "@/app/components/ui";
import NewChainForm from "./NewChainForm";

export default function ChainsPage() {
  return (
    <>
      <PageHeader
        title="Prompt chains"
        subtitle="Each chain is a sequence of prompts where one step's output becomes the next step's input."
      />

      <Suspense fallback={<Skeleton className="h-64" />}>
        <Chains />
      </Suspense>

      <h2 className="mt-10 mb-3 text-sm font-semibold tracking-tight">
        New chain
      </h2>
      <Card>
        <NewChainForm />
      </Card>
    </>
  );
}

async function Chains() {
  const chains = await listChains();

  if (chains.length === 0) {
    return (
      <EmptyState
        title="No chains yet."
        hint="A chain is a name and a slug; the steps come next."
      />
    );
  }

  return (
    <div className="grid gap-3">
      {chains.map(({ chain, stepCount, runCount, lastRunAt }) => (
        <Card key={chain.id} className="!p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/chains/${chain.id}`}
                  className="font-medium hover:underline"
                >
                  {chain.name}
                </Link>
                <code className="text-xs" style={{ color: "var(--muted)" }}>
                  {chain.slug}
                </code>
                {!chain.is_active && <Badge tone="warning">inactive</Badge>}
                {chain.style && <Badge>{chain.style}</Badge>}
                {chain.voice && <Badge>voice: {chain.voice}</Badge>}
              </div>

              {chain.description && (
                <p
                  className="mt-1.5 max-w-3xl text-sm"
                  style={{ color: "var(--muted)" }}
                >
                  {chain.description}
                </p>
              )}

              <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
                {stepCount} {stepCount === 1 ? "step" : "steps"} ·{" "}
                {runCount === 0
                  ? "never run"
                  : `${runCount} ${runCount === 1 ? "run" : "runs"}, last ${formatDateTime(lastRunAt)}`}
              </p>
            </div>

            <div className="flex shrink-0 gap-2">
              <Link href={`/chains/${chain.id}`} className="btn btn-secondary">
                Edit
              </Link>
              <Link
                href={`/chains/${chain.id}/media`}
                className="btn btn-secondary"
              >
                Media
              </Link>
              <Link
                href={`/chains/${chain.id}/run`}
                className="btn btn-primary"
                aria-disabled={stepCount === 0}
              >
                Run
              </Link>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
