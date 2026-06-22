/** SUIKA X — Subsystem Registry view: all 18 subsystems with status & specs. */
"use client";

import { SUBSYSTEMS } from "./catalog";
import { SectionCard, Tag } from "./primitives";
import { useSuika } from "@/lib/suika/store";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const statusTone: Record<string, "emerald" | "amber" | "muted"> = {
  live: "emerald",
  architected: "amber",
  planned: "muted",
};

export function RegistryView() {
  const setView = useSuika((s) => s.setView);

  return (
    <div className="space-y-4">
      <SectionCard title="SUIKA X — 18 Subsystems" desc="The cognitive operating system, by module. Live modules are fully functional here; architected/planned modules define the production target.">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {SUBSYSTEMS.map((s) => {
            const Icon = s.icon;
            return (
              <Card
                key={s.id}
                className={cn(
                  "flex flex-col gap-2 p-4 transition-colors",
                  s.view ? "cursor-pointer hover:border-emerald-500/40 hover:bg-emerald-500/5" : ""
                )}
                onClick={() => s.view && setView(s.view!)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg bg-emerald-500/10 p-2"><Icon className="h-4 w-4 text-emerald-400" /></div>
                    <div>
                      <p className="text-sm font-semibold">{s.name}</p>
                      <p className="font-mono text-[10px] text-muted-foreground">{s.id}</p>
                    </div>
                  </div>
                  <Tag tone={statusTone[s.status]}>{s.status}</Tag>
                </div>
                <p className="text-xs text-muted-foreground">{s.spec}</p>
                <p className="mt-auto pt-1 text-[10px] text-muted-foreground/80">
                  <span className="text-emerald-400/70">backing:</span> {s.backing}
                </p>
              </Card>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard title="Deployment topology (production target)" desc="The single-node realization here mirrors the contracts of the full multi-service topology">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-border/50 p-3">
            <p className="text-xs font-semibold text-emerald-300">This build (single-node)</p>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              <li>· Next.js 16 App Router + TypeScript</li>
              <li>· SQLite via Prisma (all 8 models)</li>
              <li>· z-ai-web-dev-sdk inference backend (7 personas)</li>
              <li>· In-process event bus + live metrics</li>
              <li>· Hashed-projection embeddings + hybrid retrieval</li>
            </ul>
          </div>
          <div className="rounded-lg border border-border/50 p-3">
            <p className="text-xs font-semibold text-amber-300">Full production target</p>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              <li>· Go / Rust / Python / TS microservices on K8s</li>
              <li>· PostgreSQL + Neo4j + Qdrant + Redis + MinIO</li>
              <li>· Kafka event sourcing + Ray distributed agents</li>
              <li>· gRPC + Protobuf contracts, mTLS, Vault, OTel</li>
              <li>· Helm + Terraform + ArgoCD GitOps</li>
            </ul>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
