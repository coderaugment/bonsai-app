import type { TicketType } from "@/types";

export interface TicketTypeConfig {
  label: string;
  color: string;
  bg: string;
  text: string;
  placeholder: string;
  criteriaPlaceholder: string;
}

export const ticketTypes: Record<TicketType, TicketTypeConfig> = {
  feature: {
    label: "Feature",
    color: "var(--badge-feature)",
    bg: "var(--badge-feature)",
    text: "var(--badge-feature-text)",
    placeholder: `Add dark mode toggle to settings page

Users have requested the ability to switch between light and dark themes. Add a toggle in Settings > Appearance that persists the preference and applies the theme immediately without a page reload.`,
    criteriaPlaceholder: `- [ ] Toggle appears in Settings > Appearance
- [ ] Selecting dark mode applies theme immediately
- [ ] Preference persists across page reloads
- [ ] No flash of wrong theme on initial load`,
  },
  bug: {
    label: "Bugfix",
    color: "var(--badge-bug)",
    bg: "var(--badge-bug)",
    text: "var(--badge-bug-text)",
    placeholder: `Fix login form not validating empty email field

When a user submits the login form with an empty email, the form submits without showing a validation error. The server returns a 400 but the user sees no feedback. Add client-side validation to show an inline error message.`,
    criteriaPlaceholder: `- [ ] Empty email shows inline error on submit
- [ ] Error clears when user starts typing
- [ ] Form does not submit until validation passes
- [ ] Existing valid-email flow still works`,
  },
  chore: {
    label: "Chore",
    color: "var(--badge-chore)",
    bg: "var(--badge-chore)",
    text: "var(--badge-chore-text)",
    placeholder: `Upgrade React from 18 to 19

We're a major version behind. The upgrade unblocks server components and the new use() hook. Run the codemod, fix breaking changes in our custom hooks, and verify all tests pass.`,
    criteriaPlaceholder: `- [ ] All packages updated to React 19 compatible versions
- [ ] Codemod applied and reviewed
- [ ] All existing tests pass
- [ ] No console warnings from deprecated APIs`,
  },
};
