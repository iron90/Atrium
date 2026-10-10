export function PinIcon({ active }: { active: boolean }) {
  return (
    <svg
      className="project-action-icon"
      data-icon={active ? "pin-filled" : "pin"}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        d="M8 3.25h8v2.4l2.4 2.6v2.1h-4.7v8.4h-2.4V10.35H5.6V8.25L8 5.65V3.25Z"
        fill={active ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function EyeIcon({ slashed }: { slashed: boolean }) {
  return (
    <svg
      className="project-action-icon"
      data-icon={slashed ? "eye-off" : "eye"}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        d="M2.5 12s3.35-5.5 9.5-5.5 9.5 5.5 9.5 5.5-3.35 5.5-9.5 5.5S2.5 12 2.5 12Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <circle
        cx="12"
        cy="12"
        r="2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      {slashed ? (
        <path
          d="m4.25 4.25 15.5 15.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
      ) : null}
    </svg>
  );
}
