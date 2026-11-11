import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";
import ipaddr from "ipaddr.js";

export class ProviderEndpointError extends Error {
  constructor() {
    super(
      "Use a public HTTPS provider endpoint. Local and private network addresses are unavailable.",
    );
  }
}
export function isPublicAddress(address: string): boolean {
  try {
    return ipaddr.process(address).range() === "unicast";
  } catch {
    return false;
  }
}
export async function resolveProvider(
  baseUrl: string,
  resolveHost: (
    hostname: string,
  ) => Promise<{ address: string; family: number }[]> = (hostname) =>
    lookup(hostname, { all: true }),
) {
  const url = new URL(baseUrl);
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (
    url.protocol !== "https:" ||
    (url.port && url.port !== "443") ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    hostname.endsWith(".") ||
    /(^|\.)(localhost|local|internal)$/.test(hostname)
  )
    throw new ProviderEndpointError();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const records = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) }]
    : await Promise.race([
        resolveHost(hostname),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("Provider DNS lookup timed out.")),
            5000,
          );
        }),
      ]).finally(() => clearTimeout(timer));
  // Reject mixed public/private DNS answers, not just whichever answer is first.
  if (!records.length || records.some((r) => !isPublicAddress(r.address)))
    throw new ProviderEndpointError();
  const address = records.find((r) => r.family === 4) ?? records[0];
  return { url, address };
}

// Resolve once, pin the connection to a validated public IP, retain TLS hostname verification,
// and never follow redirects. The SDK receives only this bounded transport for a BYOK call.
export async function createProviderFetch(
  baseUrl: string,
): Promise<typeof fetch> {
  const { url: base, address } = await resolveProvider(baseUrl);
  const expected = new URL(base.href.replace(/\/+$/, "") + "/chat/completions");
  return async (input, init) => {
    const incoming = new Request(input, init);
    if (incoming.url !== expected.href || incoming.method !== "POST")
      throw new ProviderEndpointError();
    const body = Buffer.from(await incoming.arrayBuffer());
    if (body.length > 128 * 1024)
      throw new Error("Provider request exceeds the size limit.");
    return new Promise<Response>((resolve, reject) => {
      const req = httpsRequest(
        expected,
        {
          method: "POST",
          agent: false,
          signal: incoming.signal,
          headers: Object.fromEntries(incoming.headers),
          // A fresh non-pooled connection must use the checked address, preventing DNS rebinding.
          lookup: ((
            _host: unknown,
            options: { all?: boolean },
            callback: (...args: unknown[]) => void,
          ) => {
            if (options.all) callback(null, [address]);
            else callback(null, address.address, address.family);
          }) as LookupFunction,
        },
        (res) => {
          if ((res.statusCode ?? 500) >= 300 && (res.statusCode ?? 500) < 400) {
            res.resume();
            reject(new Error("Provider redirects are not supported."));
            return;
          }
          const chunks: Buffer[] = [];
          let bytes = 0;
          res.on("data", (chunk: Buffer) => {
            bytes += chunk.length;
            if (bytes > 256 * 1024) {
              res.destroy(
                new Error("Provider response exceeds the size limit."),
              );
              return;
            }
            chunks.push(chunk);
          });
          res.on("error", reject);
          res.on("end", () => {
            try {
              resolve(
                new Response(
                  [204, 205].includes(res.statusCode ?? 0)
                    ? null
                    : Buffer.concat(chunks),
                  {
                    status: res.statusCode ?? 502,
                    headers: {
                      "Content-Type":
                        res.headers["content-type"] ?? "application/json",
                    },
                  },
                ),
              );
            } catch (err) {
              reject(err);
            }
          });
        },
      );
      req.setTimeout(25000, () =>
        req.destroy(new Error("Provider request timed out.")),
      );
      req.on("error", reject);
      req.end(body);
    });
  };
}
