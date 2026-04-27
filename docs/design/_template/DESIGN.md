---
version: alpha
name: Example Initiative
colors:
  primary: "#1F2937"
  secondary: "#6B7280"
  accent: "#2563EB"
  surface: "#F9FAFB"
  on-primary: "#FFFFFF"
  on-accent: "#FFFFFF"
typography:
  title:
    fontFamily: Inter
    fontSize: 2rem
    fontWeight: "700"
    lineHeight: "1.2"
  body:
    fontFamily: Inter
    fontSize: 1rem
    fontWeight: "400"
    lineHeight: "1.5"
rounded:
  sm: 8px
  md: 12px
spacing:
  sm: 8px
  md: 16px
  lg: 24px
components:
  page:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    typography: "{typography.body}"
    padding: 24px
  page-header:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.title}"
    rounded: "{rounded.md}"
    padding: 16px
  note:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.secondary}"
    rounded: "{rounded.sm}"
    padding: 8px
  callout:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.md}"
    padding: 16px
---

## Overview
Summarize the initiative, why it exists, and the intended user experience or operational outcome.

## Colors
Explain the palette and what each token is for.

## Typography
Describe the type system and emphasis rules.

## Layout
Document spacing, density, and page structure expectations.

## Shapes
Describe corner radius and shape language.

## Components
List the most important reusable patterns and how they should feel in use.

## Do's and Don'ts
- **Do** capture the stable design decisions that other teams should preserve.
- **Do** link out to implementation specs, issues, or code when details live elsewhere.
- **Do** run `npm run design:lint` before opening a PR so the repo-wide DESIGN.md check stays green.
- **Don't** duplicate every engineering detail in the design artifact.
- **Don't** leave unresolved placeholders in a finalized design doc.
