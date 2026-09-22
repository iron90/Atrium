import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PageTransition } from "./PageTransition";
import type { PageId } from "./navigation";

function TransitionHarness({ onMount }: { onMount: (page: PageId) => void }) {
  const [page, setPage] = React.useState<PageId>("projects");
  const [modelRevision, setModelRevision] = React.useState(0);

  return (
    <>
      <button type="button" onClick={() => setPage("projects")}>
        Projects
      </button>
      <button type="button" onClick={() => setPage("git")}>
        Git history
      </button>
      <button
        type="button"
        onClick={() => setModelRevision((value) => value + 1)}
      >
        Update model
      </button>
      <PageTransition pageKey={page}>
        {(currentPage) => (
          <PageProbe
            page={currentPage}
            modelRevision={modelRevision}
            onMount={onMount}
          />
        )}
      </PageTransition>
    </>
  );
}

function PageProbe({
  page,
  modelRevision,
  onMount,
}: {
  page: PageId;
  modelRevision: number;
  onMount: (page: PageId) => void;
}) {
  React.useEffect(() => {
    onMount(page);
  }, [onMount, page]);

  return (
    <div data-testid={`page-content-${page}`}>
      {page}:{modelRevision}
    </div>
  );
}

describe("PageTransition", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("keeps each page mounted while switching between tabs", () => {
    vi.useFakeTimers();
    const mounts = { projects: 0, git: 0, settings: 0 };
    const onMount = (page: PageId) => {
      mounts[page] += 1;
    };
    render(<TransitionHarness onMount={onMount} />);

    expect(mounts.projects).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: "Git history" }));
    fireEvent.click(screen.getByRole("button", { name: "Projects" }));

    expect(mounts.projects).toBe(1);
    expect(mounts.git).toBe(1);
  });

  it("freezes the outgoing view until its transition is complete", () => {
    vi.useFakeTimers();
    const mounts = { projects: 0, git: 0, settings: 0 };
    const onMount = (page: PageId) => {
      mounts[page] += 1;
    };
    render(<TransitionHarness onMount={onMount} />);

    fireEvent.click(screen.getByRole("button", { name: "Git history" }));
    fireEvent.click(screen.getByRole("button", { name: "Update model" }));

    const outgoingProjects = document.querySelector(
      '[data-page-stage="projects"].page-transition-stage-outgoing [data-testid="page-content-projects"]',
    );
    expect(outgoingProjects).toHaveTextContent("projects:0");

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Projects" }));
    });

    expect(screen.getByTestId("page-content-projects")).toHaveTextContent(
      "projects:1",
    );
  });
});
