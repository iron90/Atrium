import { afterEach, describe, expect, it, vi } from "vitest";
import { openRunningWebService } from "./web-service";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("openRunningWebService", () => {
  it("opens the browser when the service responds", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response());
    const openMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("open", openMock);

    await openRunningWebService("http://127.0.0.1:3000");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:3000",
      expect.objectContaining({ mode: "no-cors" }),
    );
    expect(openMock).toHaveBeenCalledWith(
      "http://127.0.0.1:3000",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("does not open the browser when the service is down", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );
    const openMock = vi.fn();
    vi.stubGlobal("open", openMock);

    await expect(
      openRunningWebService("http://127.0.0.1:3000"),
    ).rejects.toThrow("Web service is not running at http://127.0.0.1:3000.");
    expect(openMock).not.toHaveBeenCalled();
  });

  it("rejects a non-http address before probing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      openRunningWebService("file:///tmp/preview.html"),
    ).rejects.toThrow("Web service URL is not valid");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
