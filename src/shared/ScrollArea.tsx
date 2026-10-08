import {
  createElement,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";
import {
  cancelScheduledAnimationFrame,
  scheduleAnimationFrame,
} from "./animation";

const TRACK_INSET = 7;

type ViewportTag = "aside" | "div" | "main" | "pre" | "textarea";

type Thumb = {
  visible: boolean;
  top: number;
  height: number;
};

const hiddenThumb: Thumb = { visible: false, top: 0, height: 0 };

function trackMetrics(viewport: HTMLElement, thumbHeight: number) {
  const viewportHeight = viewport.clientHeight;
  const contentHeight = viewport.scrollHeight;
  const trackHeight = Math.max(0, viewportHeight - TRACK_INSET * 2);
  const travel = Math.max(1, trackHeight - thumbHeight);
  const scrollRange = Math.max(1, contentHeight - viewportHeight);
  return {
    travel,
    scrollRange,
    minTop: TRACK_INSET,
    maxTop: TRACK_INSET + travel,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function ScrollArea({
  className,
  viewportClassName,
  viewportComponent = "div",
  viewportProps,
  children,
}: {
  className?: string;
  viewportClassName?: string;
  viewportComponent?: ViewportTag;
  viewportProps?: ComponentPropsWithoutRef<"textarea">;
  children?: ReactNode;
}) {
  const viewportRef = useRef<HTMLElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const dragRef = useRef<{ startY: number; startTop: number } | null>(null);
  const thumbRef = useRef<Thumb>(hiddenThumb);
  const [thumb, setThumb] = useState<Thumb>(hiddenThumb);

  const updateThumb = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const viewportHeight = viewport.clientHeight;
    const contentHeight = viewport.scrollHeight;
    const trackHeight = Math.max(0, viewportHeight - TRACK_INSET * 2);
    const next =
      contentHeight <= viewportHeight + 1 || trackHeight <= 0
        ? hiddenThumb
        : (() => {
            const height = Math.max(
              28,
              Math.min(
                trackHeight,
                (trackHeight * viewportHeight) / contentHeight,
              ),
            );
            const travel = Math.max(0, trackHeight - height);
            const scrollRange = Math.max(1, contentHeight - viewportHeight);
            return {
              visible: true,
              height,
              top: TRACK_INSET + (viewport.scrollTop / scrollRange) * travel,
            };
          })();

    const current = thumbRef.current;
    if (
      current.visible === next.visible &&
      Math.abs(current.top - next.top) < 0.5 &&
      Math.abs(current.height - next.height) < 0.5
    ) {
      return;
    }
    thumbRef.current = next;
    setThumb(next);
  }, []);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const schedule = () => {
      if (frameRef.current !== null) return;
      frameRef.current = scheduleAnimationFrame(() => {
        frameRef.current = null;
        updateThumb();
      });
    };

    schedule();
    viewport.addEventListener("scroll", schedule, { passive: true });
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(schedule);
    resizeObserver?.observe(viewport);
    const mutationObserver = new MutationObserver(schedule);
    mutationObserver.observe(viewport, { childList: true, subtree: true });

    return () => {
      viewport.removeEventListener("scroll", schedule);
      resizeObserver?.disconnect();
      mutationObserver.disconnect();
      if (frameRef.current !== null) {
        cancelScheduledAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [updateThumb]);

  const viewportClass = viewportClassName
    ? `scroll-area-viewport ${viewportClassName}`
    : "scroll-area-viewport";

  return (
    <div className={className ? `scroll-area ${className}` : "scroll-area"}>
      {createElement(
        viewportComponent,
        {
          ...viewportProps,
          ref: viewportRef,
          className: viewportClass,
        },
        children,
      )}
      {thumb.visible ? (
        <div
          className="main-scrollbar"
          aria-hidden="true"
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            const viewport = viewportRef.current;
            if (!viewport) return;
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            const currentThumb = thumbRef.current;
            if (event.target !== event.currentTarget) {
              dragRef.current = {
                startY: event.clientY,
                startTop: currentThumb.top,
              };
              return;
            }
            const rect = event.currentTarget.getBoundingClientRect();
            const { travel, minTop } = trackMetrics(
              viewport,
              currentThumb.height,
            );
            const desiredTop = clamp(
              event.clientY - rect.top - currentThumb.height / 2,
              minTop,
              minTop + travel,
            );
            const { scrollRange } = trackMetrics(viewport, currentThumb.height);
            viewport.scrollTop = ((desiredTop - minTop) / travel) * scrollRange;
            dragRef.current = { startY: event.clientY, startTop: desiredTop };
          }}
          onPointerMove={(event) => {
            const drag = dragRef.current;
            const viewport = viewportRef.current;
            if (!drag || !viewport) return;
            const currentThumb = thumbRef.current;
            const { travel, scrollRange, minTop } = trackMetrics(
              viewport,
              currentThumb.height,
            );
            const top = clamp(
              drag.startTop + (event.clientY - drag.startY),
              minTop,
              minTop + travel,
            );
            viewport.scrollTop = ((top - minTop) / travel) * scrollRange;
          }}
          onPointerUp={() => {
            dragRef.current = null;
          }}
          onPointerCancel={() => {
            dragRef.current = null;
          }}
          onWheel={(event) => {
            const viewport = viewportRef.current;
            if (viewport) viewport.scrollTop += event.deltaY;
          }}
        >
          <span
            className="main-scrollbar-thumb"
            style={{
              height: `${thumb.height}px`,
              transform: `translateY(${thumb.top}px)`,
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
