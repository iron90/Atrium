# Interaction standards

Atrium uses one small motion system for navigation, lists, disclosures, actions,
and asynchronous status. Motion communicates state changes; it does not change
layout or compete with the content.

## Shared rules

- Hover changes color, border, or background only. Controls do not jump on hover.
- Keyboard focus uses a 2px accent outline with a 2px offset.
- A press gives enabled controls a 1px downward response. Disabled controls never
  receive hover or press feedback.
- State changes use the shared easing and duration tokens in `src/app.css`.
- Every repeating animation is disabled when `prefers-reduced-motion: reduce` is
  enabled.

## Interaction matrix

| Interaction                        | Feedback                                                                           | Timing        |
| ---------------------------------- | ---------------------------------------------------------------------------------- | ------------- |
| Sidebar page switch                | Active navigation indicator plus a short page fade/translate-in                    | 220ms         |
| Project, matrix, and Git list rows | Shared hover/selected background and border treatment; 1px press response          | 180ms / 120ms |
| Protocol and command disclosures   | Chevron rotates 90 degrees; contents fade and move in by 4px                       | 180ms         |
| Buttons and compact controls       | Border/background/color transition; consistent focus ring; 1px press response      | 120ms         |
| Refresh, scan, and Git loading     | Busy state disables the control and shows a rotating glyph                         | 900ms loop    |
| Cleanup progress                   | Progress bar interpolates between reported percentages; status panels enter softly | 280ms / 180ms |
| Active run                         | Accent status dot pulses while a command is running                                | 1.4s loop     |

## Implementation coverage

- Navigation is mounted inside `.page-view`, keyed by page, so switching pages
  gets the same entrance treatment without affecting the persistent sidebar.
- Native `<details>` remains the source of truth for disclosure semantics. CSS
  adds the shared chevron and entrance treatment without replacing keyboard or
  screen-reader behavior.
- `aria-busy`, `role="status"`, and `role="progressbar"` continue to describe
  asynchronous states independently of the visual animation.
- `@media (prefers-reduced-motion: reduce)` collapses all transitions and
  repeating animations to an effectively instant state.
