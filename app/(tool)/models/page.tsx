import { Suspense } from "react";
import { listModels } from "@/lib/data/chains";
import {
  Badge,
  Card,
  PageHeader,
  Row,
  Skeleton,
  Table,
} from "@/app/components/ui";

/**
 * The registry, read-only.
 *
 * Models and providers are administered in the admin panel, which is where the
 * CRUD for them already lives; duplicating it here would mean two editors for
 * one table. What this tool needs is the answer to "why can this step not run",
 * and that is a provider with no key -- so that is what the screen shows.
 */
export default function ModelsPage() {
  return (
    <>
      <PageHeader
        title="Models"
        subtitle="What a step may be pointed at. Each step of a chain picks its own, so one chain can span several models."
      />
      <Suspense fallback={<Skeleton className="h-64" />}>
        <Models />
      </Suspense>
    </>
  );
}

async function Models() {
  const models = await listModels();
  const runnable = models.filter((model) => model.isActive && model.providerActive);

  return (
    <>
      <Card className="mb-6">
        <p className="text-sm">
          {runnable.length} of {models.length} registered models can actually be
          called from this deployment. The rest are either retired by their
          provider or served by a provider this project holds no API key for —
          both of which are real states the registry is meant to record, not
          gaps in it.
        </p>
        <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
          No key is stored in the database. A provider row names the environment
          variable its key lives in, and nothing more.
        </p>
      </Card>

      <Table head={["Model", "Provider", "Flags", "Usable here"]}>
        {models.map((model) => (
          <Row key={model.id}>
            <td className="px-4 py-2.5">
              <div className="font-medium">{model.displayName}</div>
              <code className="text-xs" style={{ color: "var(--muted)" }}>
                {model.slug}
              </code>
            </td>
            <td className="px-4 py-2.5">{model.providerName}</td>
            <td className="px-4 py-2.5">
              <div className="flex flex-wrap gap-1.5">
                {model.isDefault && <Badge>default</Badge>}
                {model.supportsVision && <Badge>vision</Badge>}
                {!model.isActive && <Badge tone="warning">retired</Badge>}
              </div>
            </td>
            <td className="px-4 py-2.5">
              {model.isActive && model.providerActive ? (
                <Badge tone="positive">yes</Badge>
              ) : (
                <Badge tone="negative">
                  {model.providerActive ? "retired model" : "no key"}
                </Badge>
              )}
            </td>
          </Row>
        ))}
      </Table>
    </>
  );
}
