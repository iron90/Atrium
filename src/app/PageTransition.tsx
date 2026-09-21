import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  cancelScheduledAnimationFrame,
  scheduleAnimationFrame,
} from "../shared/animation";
import type { PageId } from "./navigation";

type PageTransitionPhase = "settled" | "entering";

export function PageTransition({
  pageKey,
  children,
}: {
  pageKey: PageId;
  children: (page: PageId) => ReactNode;
}) {
  const [displayedPage, setDisplayedPage] = useState(pageKey);
  const [phase, setPhase] = useState<PageTransitionPhase>("settled");
  const transitionId = useRef(0);
  const displayedPageRef = useRef(pageKey);
  const settleFrameId = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (pageKey === displayedPageRef.current) return;

    transitionId.current += 1;
    const currentTransitionId = transitionId.current;
    displayedPageRef.current = pageKey;
    if (settleFrameId.current !== null) {
      cancelScheduledAnimationFrame(settleFrameId.current);
    }
    setDisplayedPage(pageKey);
    setPhase("entering");

    settleFrameId.current = scheduleAnimationFrame(() => {
      if (transitionId.current === currentTransitionId) {
        setPhase("settled");
        settleFrameId.current = null;
      }
    });

    return () => {
      if (settleFrameId.current !== null) {
        cancelScheduledAnimationFrame(settleFrameId.current);
      }
    };
  }, [pageKey]);

  return (
    <div className={`page-transition page-transition-${phase}`}>
      <div className="page-transition-stage">{children(displayedPage)}</div>
    </div>
  );
}
