/**
 * SUIKA X — Model Router registry.
 *
 * The router exposes 7 model personas (matching the required ecosystem:
 * OpenAI / Claude / Gemini / GLM / DeepSeek / Qwen / Ollama). Each persona
 * carries a cost/latency/context profile and a system prompt. All personas are
 * served by the single available inference backend (Z.ai) — the router applies
 * the persona's system prompt and records the call under that model identity.
 * This is an honest single-backend realization of a multi-model routing layer.
 */
import type { ModelPersona } from "./types";

export const MODEL_PERSONAS: ModelPersona[] = [
  {
    id: "gpt-4o",
    label: "GPT-4o (OpenAI-class)",
    family: "openai",
    strengths: ["general", "code", "vision", "tool-use"],
    contextWindow: 128_000,
    costPer1kIn: 0.005,
    costPer1kOut: 0.015,
    avgLatencyMs: 900,
    systemPrompt:
      "You are GPT-4o, a balanced general-purpose reasoning assistant. Be precise, structured, and direct.",
  },
  {
    id: "claude-opus",
    label: "Claude Opus (Anthropic-class)",
    family: "anthropic",
    strengths: ["reasoning", "long-context", "writing", "analysis"],
    contextWindow: 200_000,
    costPer1kIn: 0.015,
    costPer1kOut: 0.075,
    avgLatencyMs: 1400,
    systemPrompt:
      "You are Claude Opus, a careful analytical assistant. Reason step by step, surface assumptions, and write with nuance.",
  },
  {
    id: "gemini-pro",
    label: "Gemini Pro (Google-class)",
    family: "google",
    strengths: ["multimodal", "long-context", "search", "speed"],
    contextWindow: 1_000_000,
    costPer1kIn: 0.00125,
    costPer1kOut: 0.005,
    avgLatencyMs: 700,
    systemPrompt:
      "You are Gemini Pro, a fast multimodal assistant. Synthesize across sources and ground answers in evidence.",
  },
  {
    id: "glm-4.6",
    label: "GLM-4.6 (Zhipu-class)",
    family: "zhipu",
    strengths: ["bilingual", "agent", "tool-use", "cost"],
    contextWindow: 128_000,
    costPer1kIn: 0.002,
    costPer1kOut: 0.006,
    avgLatencyMs: 800,
    systemPrompt:
      "You are GLM-4.6, an agentic assistant strong in bilingual reasoning and tool use. Act concisely and correctly.",
  },
  {
    id: "deepseek-v3",
    label: "DeepSeek-V3 (DeepSeek-class)",
    family: "deepseek",
    strengths: ["reasoning", "math", "code", "cost"],
    contextWindow: 64_000,
    costPer1kIn: 0.00027,
    costPer1kOut: 0.0011,
    avgLatencyMs: 1000,
    systemPrompt:
      "You are DeepSeek-V3, a reasoning specialist. Prioritize mathematical and logical rigor; show derivations.",
  },
  {
    id: "qwen-max",
    label: "Qwen-Max (Alibaba-class)",
    family: "alibaba",
    strengths: ["bilingual", "long-context", "instruction", "code"],
    contextWindow: 128_000,
    costPer1kIn: 0.0024,
    costPer1kOut: 0.0096,
    avgLatencyMs: 850,
    systemPrompt:
      "You are Qwen-Max, an instruction-following assistant. Follow the task specification exactly and verify outputs.",
  },
  {
    id: "ollama-llama3",
    label: "Ollama Llama3 (local-class)",
    family: "ollama",
    strengths: ["local", "private", "free", "low-latency"],
    contextWindow: 8_000,
    costPer1kIn: 0,
    costPer1kOut: 0,
    avgLatencyMs: 400,
    systemPrompt:
      "You are a local Llama3 model running on-device. Keep answers short and self-contained; no external calls.",
  },
];

export function getPersona(id: string): ModelPersona | undefined {
  return MODEL_PERSONAS.find((p) => p.id === id);
}

/**
 * Heuristic router. Inspects the prompt signals and selects the cheapest model
 * whose strengths cover the requirement, with a fallback chain ordered by
 * reliability then cost.
 */
export function routePrompt(prompt: string): {
  primary: ModelPersona;
  fallback: ModelPersona[];
  reason: string;
  signals: {
    length: number;
    hasCode: boolean;
    needsReasoning: boolean;
    needsLongContext: boolean;
    costSensitive: boolean;
  };
} {
  const length = prompt.length;
  const hasCode = /(\bfunction\b|\bdef\b|```|=>|\bclass\b|import\s)/.test(prompt);
  const needsReasoning =
    /\b(why|explain|derive|prove|reason|analyze|compare|design|architect)\b/i.test(
      prompt
    );
  const needsLongContext = length > 12_000;
  const costSensitive = length < 1500 && !needsReasoning;

  const byId = (id: string) => MODEL_PERSONAS.find((p) => p.id === id)!;

  let primary: ModelPersona;
  let reason: string;

  if (needsLongContext) {
    primary = byId("gemini-pro");
    reason = "Long-context input → Gemini-Pro (1M window, low cost/1k).";
  } else if (needsReasoning && /math|equation|derive|prove|integral|sum/.test(prompt)) {
    primary = byId("deepseek-v3");
    reason = "Mathematical reasoning detected → DeepSeek-V3 (cheapest reasoning model).";
  } else if (needsReasoning && length > 4000) {
    primary = byId("claude-opus");
    reason = "Deep reasoning over long input → Claude Opus (best long-context analysis).";
  } else if (hasCode && costSensitive) {
    primary = byId("deepseek-v3");
    reason = "Code task, cost-sensitive → DeepSeek-V3 (strong code, lowest cost).";
  } else if (costSensitive) {
    primary = byId("ollama-llama3");
    reason = "Short, simple, cost-sensitive → local Ollama Llama3 (zero cost).";
  } else if (hasCode) {
    primary = byId("gpt-4o");
    reason = "General code task → GPT-4o (balanced code + tool use).";
  } else if (/translate|翻译|chinese|english|中文/.test(prompt)) {
    primary = byId("qwen-max");
    reason = "Bilingual / instruction task → Qwen-Max.";
  } else {
    primary = byId("glm-4.6");
    reason = "General agentic task → GLM-4.6 (balanced agent model).";
  }

  // Fallback chain: reliable alternates ordered by family diversity then cost.
  const fallback = MODEL_PERSONAS.filter((p) => p.id !== primary.id)
    .filter((p) => p.family !== primary.family)
    .sort((a, b) => a.costPer1kIn + a.costPer1kOut - (b.costPer1kIn + b.costPer1kOut))
    .slice(0, 3);

  return {
    primary,
    fallback,
    reason,
    signals: { length, hasCode, needsReasoning, needsLongContext, costSensitive },
  };
}
