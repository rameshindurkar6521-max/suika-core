/** SUIKA X — Knowledge Fabric view: graph + entity/relation authoring. */
"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/suika/api";
import { useSuika } from "@/lib/suika/store";
import { SectionCard, Tag, Meter } from "./primitives";
import { GraphCanvas } from "./GraphCanvas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Plus, Trash2, RefreshCw } from "lucide-react";

export function FabricView() {
  const qc = useQueryClient();
  const ws = useSuika((s) => s.workspaceId) ?? undefined;
  const bump = useSuika((s) => s.bump);

  const [name, setName] = useState("");
  const [type, setType] = useState("concept");
  const [propsRaw, setPropsRaw] = useState('{"desc":""}');
  const [salience, setSalience] = useState(0.7);

  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [relType, setRelType] = useState("related_to");

  const graph = useQuery({
    queryKey: ["graph", ws],
    queryFn: () => api.fabric.graph({ ws, limit: 200 }),
    refetchInterval: 7000,
  });

  const createEntity = useMutation({
    mutationFn: () => {
      let properties: Record<string, unknown> = {};
      try {
        properties = propsRaw.trim() ? JSON.parse(propsRaw) : {};
      } catch {
        return Promise.reject(new Error("properties must be valid JSON"));
      }
      return api.fabric.createEntity({ name, type, properties, salience, workspaceId: ws });
    },
    onSuccess: () => {
      toast.success("Entity created");
      setName("");
      setPropsRaw('{"desc":""}');
      qc.invalidateQueries({ queryKey: ["graph", ws] });
      bump();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteEntity = useMutation({
    mutationFn: (id: string) => api.fabric.deleteEntity(id),
    onSuccess: () => {
      toast.success("Entity removed");
      qc.invalidateQueries({ queryKey: ["graph", ws] });
      bump();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createRelation = useMutation({
    mutationFn: () => api.fabric.createRelation({ fromId, toId, type: relType, weight: 1 }),
    onSuccess: () => {
      toast.success("Relation created");
      setFromId("");
      setToId("");
      qc.invalidateQueries({ queryKey: ["graph", ws] });
      bump();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const nodes = graph.data?.graph.nodes ?? [];
  const edges = graph.data?.graph.edges ?? [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <SectionCard
          title="Entity graph"
          desc={`${nodes.length} nodes · ${edges.length} edges`}
          className="xl:col-span-2"
          right={
            <Button size="sm" variant="ghost" onClick={() => graph.refetch()}>
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
          }
          bodyClassName="p-2"
        >
          {graph.isLoading ? (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">Loading graph…</div>
          ) : (
            <GraphCanvas graph={graph.data!.graph} />
          )}
        </SectionCard>

        <div className="space-y-4">
          <SectionCard title="Create entity" desc="Add a node to the knowledge fabric">
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Vector Index" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Type</Label>
                  <Select value={type} onValueChange={setType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["concept", "subsystem", "store", "runtime", "bus", "person", "tool"].map((t) => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Salience · {salience.toFixed(2)}</Label>
                  <input
                    type="range" min={0} max={1} step={0.05} value={salience}
                    onChange={(e) => setSalience(Number(e.target.value))}
                    className="w-full accent-emerald-400"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Properties (JSON)</Label>
                <Textarea value={propsRaw} onChange={(e) => setPropsRaw(e.target.value)} rows={3} className="font-mono text-xs" />
              </div>
              <Button
                size="sm"
                className="w-full"
                disabled={!name.trim() || createEntity.isPending}
                onClick={() => createEntity.mutate()}
              >
                <Plus className="h-4 w-4" /> Create entity
              </Button>
            </div>
          </SectionCard>

          <SectionCard title="Create relation" desc="Connect two existing entities">
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">From</Label>
                <Select value={fromId} onValueChange={setFromId}>
                  <SelectTrigger><SelectValue placeholder="select source" /></SelectTrigger>
                  <SelectContent>
                    {nodes.map((n) => (
                      <SelectItem key={n.id} value={n.id}>{n.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Type</Label>
                <Select value={relType} onValueChange={setRelType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["related_to", "uses", "part_of", "depends_on", "calls", "orchestrates", "contains"].map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">To</Label>
                <Select value={toId} onValueChange={setToId}>
                  <SelectTrigger><SelectValue placeholder="select target" /></SelectTrigger>
                  <SelectContent>
                    {nodes.map((n) => (
                      <SelectItem key={n.id} value={n.id}>{n.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                size="sm"
                className="w-full"
                disabled={!fromId || !toId || fromId === toId || createRelation.isPending}
                onClick={() => createRelation.mutate()}
              >
                <Plus className="h-4 w-4" /> Create relation
              </Button>
            </div>
          </SectionCard>
        </div>
      </div>

      <SectionCard title="Entity registry" desc="All nodes in the active workspace" bodyClassName="p-0">
        <ScrollArea className="suika-scroll max-h-96">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card/95 text-left text-xs text-muted-foreground backdrop-blur">
              <tr>
                <th className="p-2 pl-4 font-medium">Name</th>
                <th className="p-2 font-medium">Type</th>
                <th className="p-2 font-medium">Salience</th>
                <th className="p-2 font-medium">Degree</th>
                <th className="p-2 pr-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {nodes.map((n) => (
                <tr key={n.id} className="hover:bg-muted/30">
                  <td className="p-2 pl-4 font-medium">{n.name}</td>
                  <td className="p-2"><Tag tone="emerald">{n.type}</Tag></td>
                  <td className="p-2">
                    <div className="flex items-center gap-2">
                      <div className="w-16"><Meter value={n.salience} tone="emerald" /></div>
                      <span className="font-mono text-xs">{n.salience.toFixed(2)}</span>
                    </div>
                  </td>
                  <td className="p-2 font-mono text-xs">{n.degree}</td>
                  <td className="p-2 pr-4 text-right">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => deleteEntity.mutate(n.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-rose-400" />
                    </Button>
                  </td>
                </tr>
              ))}
              {nodes.length === 0 && (
                <tr><td colSpan={5} className="p-6 text-center text-sm text-muted-foreground">No entities yet.</td></tr>
              )}
            </tbody>
          </table>
        </ScrollArea>
      </SectionCard>
    </div>
  );
}
