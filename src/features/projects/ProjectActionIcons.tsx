export function StarIcon({ active }: { active: boolean }) {
  return (
    <svg
      className="project-action-icon"
      data-icon={active ? "star-filled" : "star"}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        d="m12 3.5 2.64 5.35 5.91.86-4.28 4.17 1.01 5.89L12 17l-5.28 2.77 1.01-5.89-4.28-4.17 5.91-.86L12 3.5Z"
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
