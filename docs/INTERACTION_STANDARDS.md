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

- Navigation is rendered through `PageTransition`, which keeps each page host
  mounted after its first load and preloads the remaining page hosts during
  idle time. The outgoing host keeps a frozen view snapshot while its visual
  exit completes, while the incoming host remains live and interactive. The
  completed outgoing host stays off-flow and is reused on the next navigation,
  so the animation's final frame does not compete with a React cleanup update.
  Stable page hosts let an interrupted transition reverse or continue without
  remounting the page content.
- Disclosures use `AnimatedDisclosure`, which keeps the trigger semantic,
  animates the outer grid track and container shell, and delays unmounting until
  the closing transition has finished.
- `aria-busy`, `role="status"`, and `role="progressbar"` continue to describe
  asynchronous states independently of the visual animation.
- `@media (prefers-reduced-motion: reduce)` collapses all transitions and
  repeating animations to an effectively instant state.
