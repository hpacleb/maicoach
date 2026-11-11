import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import {
  isPublicAddress,
  resolveProvider,
  ProviderEndpointError,
} from "../server/provider";
import { providerSchema } from "../shared/validation";
import { createApp, loadCatalog } from "../server/app";
import { DEFAULT_SETTINGS } from "../shared/types";

test("provider configuration normalizes URLs and rejects unsafe or ambiguous inputs", () => {
  const valid = {
    apiKey: "test-key-placeholder",
    baseUrl: "https://provider.example/api/v1/chat/completions/",
    model: "example-model",
  };
  const parsed = providerSchema.parse(valid);
  assert.equal(parsed.baseUrl, "https://provider.example/api/v1");
  assert.equal(parsed.outputMode, "chat");
  for (const baseUrl of [
    "http://provider.example/v1",
    "https://user:password@provider.example/v1",
    "https://provider.example/v1?token=secret",
    "https://provider.example/v1#token",
    "https://provider.example:8443/v1",
  ]) {
    assert.equal(
      providerSchema.safeParse({ ...valid, baseUrl }).success,
      false,
    );
  }
  assert.equal(
    providerSchema.safeParse({ ...valid, apiKey: "x\r\nInjected: x" }).success,
    false,
  );
});
test("public endpoint checks reject loopback, metadata, private, mapped and mixed DNS addresses", async () => {
  for (const address of [
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "::1",
    "fc00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "64:ff9b::a9fe:a9fe",
  ]) {
    assert.equal(isPublicAddress(address), false, address);
  }
  assert.equal(isPublicAddress("1.1.1.1"), true);
  assert.equal(isPublicAddress("2606:4700:4700::1111"), true);
  for (const url of [
    "https://127.1/v1",
    "https://[::1]/v1",
    "https://169.254.169.254/latest",
    "https://localhost/v1",
    "https://metadata.internal/v1",
  ]) {
    await assert.rejects(resolveProvider(url), ProviderEndpointError);
  }
  await assert.rejects(
    resolveProvider("https://provider.example/v1", async () => [
      { address: "1.1.1.1", family: 4 },
      { address: "10.1.2.3", family: 4 },
    ]),
    ProviderEndpointError,
  );
  const result = await resolveProvider(
    "https://provider.example/v1",
    async () => [{ address: "1.1.1.1", family: 4 }],
  );
  assert.equal(result.address.address, "1.1.1.1");
});
test("BYOK invokes LangChain with request-scoped keys, endpoints and both output modes; failures never echo keys", async () => {
  const seen: {
    url: string;
    key: string | null;
    body: Record<string, unknown>;
  }[] = [];
  // A deterministic SDK transport fixture; no paid provider request is made.
  const transport: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    const body = await request.json();
    seen.push({
      url: request.url,
      key: request.headers.get("authorization"),
      body,
    });
    if (body.model === "rejected")
      return new Response(
        JSON.stringify({
          error: {
            message: "private-provider-error-test-key-C",
            type: "invalid_request_error",
          },
        }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    return new Response(
      JSON.stringify({
        id: "fixture-completion",
        object: "chat.completion",
        created: 0,
        model: body.model,
        choices: [
          {
            index: 0,
            finish_reason: "stop",
            message: {
              role: "assistant",
              content: JSON.stringify({
                summary: "Practice one target at a time.",
                tips: ["Warm up first.", "Log each result."],
                answer:
                  body.model === "echo"
                    ? "test-key-B"
                    : "Use the proposed targets as hypotheses.",
              }),
            },
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 30, total_tokens: 130 },
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  };
  const server = createApp(loadCatalog(), false, async () => transport).listen(
    0,
    "127.0.0.1",
  );
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/coach`;
  const call = async (provider?: unknown) => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scores: [],
        settings: DEFAULT_SETTINGS,
        ...(provider ? { provider } : {}),
      }),
    });
    assert.equal(response.status, 200);
    return response.json();
  };
  try {
    const first = await call({
      apiKey: "test-key-A",
      baseUrl: "https://first.example/v1",
      model: "custom-model",
      outputMode: "chat",
    });
    assert.equal(first.mode, "ai");
    assert.equal(seen[0].key, "Bearer test-key-A");
    assert.equal(seen[0].url, "https://first.example/v1/chat/completions");
    assert.equal(seen[0].body.response_format, undefined);
    const second = await call({
      apiKey: "test-key-B",
      baseUrl: "https://second.example/api/v1",
      model: "echo",
      outputMode: "jsonSchema",
    });
    assert.equal(second.mode, "ai");
    assert.equal(second.advice.answer, "[redacted]");
    assert.equal(seen[1].key, "Bearer test-key-B");
    assert.equal(
      (seen[1].body.response_format as { type: string }).type,
      "json_schema",
    );
    const rejected = await call({
      apiKey: "test-key-C",
      baseUrl: "https://third.example/v1",
      model: "rejected",
      outputMode: "chat",
    });
    assert.equal(rejected.mode, "planner");
    assert.ok(rejected.notice);
    assert.equal(JSON.stringify(rejected).includes("test-key-C"), false);
    assert.equal((await call()).mode, "planner");
    assert.equal(seen.length, 3);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve())),
    );
  }
});
