import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { navigationItems, type PageId } from "./navigation";

const PAGE_TRANSITION_DURATION = 420;
const TRANSITION_DIAGNOSTICS_ENABLED = import.meta.env.DEV;

type IdleWindow = Window & {
  requestIdleCallback?: (
    callback: () => void,
    options?: { timeout: number },
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
};

interface PageTransitionState {
  incomingPage: PageId;
  outgoingPage: PageId | null;
  transitionId: number;
}

function debugTransition(label: string, details: Record<string, unknown>) {
  if (!TRANSITION_DIAGNOSTICS_ENABLED) return;
  console.debug(`[Atrium transition] ${label} ${JSON.stringify(details)}`);
}

function transitionMetrics() {
  if (!TRANSITION_DIAGNOSTICS_ENABLED || typeof document === "undefined") {
    return undefined;
  }

  const mainColumn = document.querySelector<HTMLElement>(".main-column");
  return {
    mainClientWidth: mainColumn?.clientWidth,
    mainOffsetWidth: mainColumn?.offsetWidth,
    mainScrollHeight: mainColumn?.scrollHeight,
    stages: Array.from(
      document.querySelectorAll<HTMLElement>("[data-page-stage]"),
    ).map((stage) => ({
      page: stage.dataset.pageStage,
      className: stage.className,
    })),
  };
}

function traceTransitionFrames(transitionId: number, from: PageId, to: PageId) {
  if (
    !TRANSITION_DIAGNOSTICS_ENABLED ||
    typeof window.requestAnimationFrame !== "function"
  ) {
    return () => undefined;
  }

  const startedAt = performance.now();
  let previousFrameAt = startedAt;
  let worstFrameGap = 0;
  let worstFrameAt = 0;
  let frameHandle: number | null = null;

  const sampleFrame = (frameAt: number) => {
    const frameGap = frameAt - previousFrameAt;
    if (frameGap > worstFrameGap) {
      worstFrameGap = frameGap;
      worstFrameAt = frameAt - startedAt;
    }
    previousFrameAt = frameAt;

    if (frameAt - startedAt < PAGE_TRANSITION_DURATION + 120) {
      frameHandle = window.requestAnimationFrame(sampleFrame);
      return;
    }

    debugTransition("frame trace", {
      transitionId,
      from,
      to,
      duration: Math.round(frameAt - startedAt),
      worstFrameGap: Math.round(worstFrameGap),
      worstFrameAt: Math.round(worstFrameAt),
    });
    frameHandle = null;
  };

  frameHandle = window.requestAnimationFrame(sampleFrame);

  return () => {
    if (frameHandle !== null) {
      window.cancelAnimationFrame(frameHandle);
      frameHandle = null;
    }
  };
}

function schedulePagePreload(callback: () => void) {
  const idleWindow = window as IdleWindow;
  if (idleWindow.requestIdleCallback) {
    const handle = idleWindow.requestIdleCallback(callback, { timeout: 1000 });
    return () => idleWindow.cancelIdleCallback?.(handle);
  }

  const handle = window.setTimeout(callback, 120);
  return () => window.clearTimeout(handle);
}

function PageSlot({
  children,
  frozen,
  className,
  isActive,
  page,
}: {
  children: ReactNode;
  frozen: boolean;
  className: string;
  isActive: boolean;
  page: PageId;
}) {
  useLayoutEffect(() => {
    if (!TRANSITION_DIAGNOSTICS_ENABLED) return;
    debugTransition("page host mounted", {
      page,
      at: Math.round(performance.now()),
    });
  }, [page]);

  useLayoutEffect(() => {
    if (!TRANSITION_DIAGNOSTICS_ENABLED) return;
    debugTransition("stage changed", {
      page,
      className,
      frozen,
      isActive,
      at: Math.round(performance.now()),
    });
  }, [className, frozen, isActive, page]);

  const displayDependency = frozen ? null : children;
  // The dependency intentionally excludes children while the outgoing view is frozen.
  const displayedChildren = useMemo(
    () => children,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [frozen, displayDependency],
  );

  return (
    <div
      className={`page-transition-stage ${className}`}
      aria-hidden={isActive ? undefined : true}
      data-page-stage={page}
    >
      {displayedChildren}
    </div>
  );
}

export function PageTransition({
  pageKey,
  children,
}: {
  pageKey: PageId;
  children: (page: PageId) => ReactNode;
}) {
  const [transition, setTransition] = useState<PageTransitionState>({
    incomingPage: pageKey,
    outgoingPage: null,
    transitionId: 0,
  });
  const transitionId = useRef(0);
  const incomingPageRef = useRef(pageKey);
  const mountedPagesRef = useRef(new Set<PageId>([pageKey]));
  const [mountedPages, setMountedPages] = useState<PageId[]>([pageKey]);
  const cancelFrameTraceRef = useRef<() => void>(() => undefined);

  const ensurePageMounted = useCallback((page: PageId) => {
    if (mountedPagesRef.current.has(page)) return;

    mountedPagesRef.current.add(page);
    setMountedPages(Array.from(mountedPagesRef.current));
  }, []);

  useLayoutEffect(() => {
    ensurePageMounted(pageKey);
  }, [ensurePageMounted, pageKey]);

  useEffect(() => {
    let disposed = false;
    let cancelScheduled: () => void = () => undefined;

    const preloadNextPage = () => {
      if (disposed) return;

      const nextPage = navigationItems.find(
        ({ id }) => !mountedPagesRef.current.has(id),
      )?.id;
      if (!nextPage) return;

      ensurePageMounted(nextPage);
      cancelScheduled = schedulePagePreload(preloadNextPage);
    };

    cancelScheduled = schedulePagePreload(preloadNextPage);

    return () => {
      disposed = true;
      cancelScheduled();
    };
  }, [ensurePageMounted]);

  useLayoutEffect(() => {
    if (pageKey === incomingPageRef.current) return;

    const outgoingPage = incomingPageRef.current;
    const currentTransitionId = ++transitionId.current;
    incomingPageRef.current = pageKey;

    cancelFrameTraceRef.current();
    cancelFrameTraceRef.current = traceTransitionFrames(
      currentTransitionId,
      outgoingPage,
      pageKey,
    );

    if (TRANSITION_DIAGNOSTICS_ENABLED) {
      debugTransition("start", {
        transitionId: currentTransitionId,
        from: outgoingPage,
        to: pageKey,
        at: Math.round(performance.now()),
        metrics: transitionMetrics(),
      });
    }

    setTransition({
      incomingPage: pageKey,
      outgoingPage,
      transitionId: currentTransitionId,
    });

    return () => {
      cancelFrameTraceRef.current();
    };
  }, [pageKey]);

  const activePage = transition.incomingPage;
  const outgoingPage = transition.outgoingPage;
  const pagesToRender = mountedPages.includes(pageKey)
    ? mountedPages
    : [...mountedPages, pageKey];

  return (
    <div
      className="page-transition"
      data-transition-id={transition.transitionId}
    >
      {pagesToRender.map((page) => {
        const isOutgoing = page === outgoingPage;
        const isActive = page === activePage;
        const stageClass = isOutgoing
          ? "page-transition-stage-outgoing"
          : isActive && outgoingPage
            ? "page-transition-stage-incoming"
            : isActive
              ? "page-transition-stage-active"
              : "page-transition-stage-cached";

        return (
          <PageSlot
            key={page}
            // Freeze only the outgoing snapshot. The other hidden hosts keep
            // receiving model updates so they are fresh when revisited, while
            // the active incoming page remains interactive during the fade.
            frozen={isOutgoing}
            className={stageClass}
            isActive={isActive}
            page={page}
          >
            {children(page)}
          </PageSlot>
        );
      })}
    </div>
  );
}
