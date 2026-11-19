import type { EnvironmentId } from "@t3tools/contracts";
import { indexBenchmarkEntries } from "@t3tools/shared/modelBenchmarkMatch";

import { useEnvironmentQuery } from "../state/query";
import { serverEnvironment } from "../state/server";

/** Model speed and price figures, indexed for lookup. The server caches the catalog, so every reader shares one copy. */
export function useModelBenchmarkIndex(environmentId: EnvironmentId | null | undefined) {
  const catalog = useEnvironmentQuery(
    environmentId ? serverEnvironment.modelBenchmarkCatalog({ environmentId, input: {} }) : null,
  ).data;
  return catalog ? indexBenchmarkEntries(catalog.entries) : null;
}
