# Interaction standards

Atrium uses one small motion system for navigation, lists, disclosures, actions,
and asynchronous status. Motion communicates state changes; it does not change
layout or compete with the content.

## Shared rules

- Hover changes color, border, or background and may lift an interactive control
  by 1px. The lift is reserved for interactive surfaces and does not change
  layout.
- Keyboard focus uses a 2px accent outline with a 2px offset.
- A press gives enabled controls a 1px downward response with a slight scale
  reduction. Disabled controls never receive hover or press feedback.
- State changes use the shared easing and duration tokens in `src/app.css`.
- Every repeating animation is disabled when `prefers-reduced-motion: reduce` is
  enabled.

## Interaction matrix

| Interaction                        | Feedback                                                                           | Timing        |
| ---------------------------------- | ---------------------------------------------------------------------------------- | ------------- |
| Sidebar page switch                | Active navigation indicator plus a page-title and content fade/translate-in        | 420ms         |
| Project, matrix, and Git list rows | Shared hover/selected background and 1px lift/press response                       | 300ms / 180ms |
| Protocol and command disclosures   | Chevron rotates 90 degrees; contents fade and move in by 8px                       | 300ms         |
| Buttons and compact controls       | Border/background/color transition; 1px hover lift; focus ring; pressed scale      | 180ms         |
| Refresh, scan, and Git loading     | Busy state disables the control and shows a rotating glyph                         | 900ms loop    |
| Cleanup progress                   | Progress bar interpolates between reported percentages; status panels enter softly | 420ms / 300ms |
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
