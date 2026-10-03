import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  cancelScheduledAnimationFrame,
  scheduleAnimationFrame,
} from "./animation";

export function AnimatedDisclosure({
  label,
  meta,
  children,
  className = "",
  defaultOpen = false,
  leading,
}: {
  label: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
  defaultOpen?: boolean;
  // An extra control (e.g. a select-all checkbox) shown beside the trigger
  // without becoming part of the pressable disclosure target.
  leading?: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [isExpanded, setIsExpanded] = useState(defaultOpen);
  const frameId = useRef<number | null>(null);
  const contentId = useId();
  const labelId = useId();

  useEffect(() => {
    if (!defaultOpen) return;
    frameId.current = scheduleAnimationFrame(() => {
      setIsExpanded(true);
    });
    return () => {
      if (frameId.current !== null) {
        cancelScheduledAnimationFrame(frameId.current);
      }
    };
  }, [defaultOpen]);

  useEffect(
    () => () => {
      if (frameId.current !== null) {
        cancelScheduledAnimationFrame(frameId.current);
      }
    },
    [],
  );

  const toggle = () => {
    const nextOpen = !isOpen;
    if (frameId.current !== null) {
      cancelScheduledAnimationFrame(frameId.current);
      frameId.current = null;
    }

    // Both classes flip in the same commit so the height and opacity
    // transitions start on the same frame; deferring one of them a frame
    // reads as a stutter at the start of the motion.
    setIsOpen(nextOpen);
    setIsExpanded(nextOpen);
  };

  const trigger = (
    <button
      className="animated-disclosure-trigger"
      type="button"
      aria-controls={contentId}
      aria-expanded={isOpen}
      aria-labelledby={labelId}
      onClick={toggle}
    >
      <span className="animated-disclosure-chevron" aria-hidden="true">
        ▸
      </span>
      <span className="animated-disclosure-label" id={labelId}>
        {label}
      </span>
      {meta ? <span className="animated-disclosure-meta">{meta}</span> : null}
    </button>
  );

  return (
    <div
      className={`animated-disclosure ${className} ${isOpen ? "is-open" : ""} ${isExpanded ? "is-expanded" : ""}`}
    >
      {leading ? (
        <div className="animated-disclosure-header">
          {leading}
          {trigger}
        </div>
      ) : (
        trigger
      )}
      <div
        className="animated-disclosure-shell"
        id={contentId}
        role="region"
        aria-hidden={!isOpen}
        aria-labelledby={labelId}
      >
        <div className="animated-disclosure-content">{children}</div>
      </div>
    </div>
  );
}
