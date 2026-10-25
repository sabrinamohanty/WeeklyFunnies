import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const eslint = new ESLint({ cwd: process.cwd() });

async function restricted(code: string, filePath: string): Promise<boolean> {
  const [result] = await eslint.lintText(code, { filePath });
  return result!.messages.some((m) => m.ruleId === "no-restricted-imports");
}

describe("vendor isolation lint rule", () => {
  it.each(["openai", "ai", "@anthropic-ai/sdk", "@ai-sdk/openai", "@google/genai", "replicate"])(
    "blocks %s outside the real provider",
    async (pkg) => {
      expect(await restricted(`import x from "${pkg}";\nvoid x;\n`, "src/lib/events/x.ts")).toBe(true);
      expect(await restricted(`import x from "${pkg}";\nvoid x;\n`, "src/lib/ai/service2.ts")).toBe(true);
    },
  );

  it("allows vendor SDKs inside src/lib/ai/providers/real", async () => {
    expect(await restricted(`import x from "openai";\nvoid x;\n`, "src/lib/ai/providers/real/x.ts")).toBe(
      false,
    );
  });

  it("blocks importing a provider directly from outside src/lib/ai", async () => {
    const code = `import { StubProvider } from "@/lib/ai/providers/stub/provider";\nvoid StubProvider;\n`;
    expect(await restricted(code, "src/app/api/x/route.ts")).toBe(true);
    expect(
      await restricted(
        `import { getAiService } from "@/lib/ai";\nvoid getAiService;\n`,
        "src/app/api/x/route.ts",
      ),
    ).toBe(false);
  });
});
