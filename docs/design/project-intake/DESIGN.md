---
version: alpha
name: Project Intake
colors:
  primary: "#111827"
  secondary: "#4B5563"
  accent: "#2563EB"
  accent-soft: "#DBEAFE"
  success: "#047857"
  danger: "#B91C1C"
  surface: "#F8FAFC"
  panel: "#FFFFFF"
  border: "#D1D5DB"
  on-primary: "#FFFFFF"
  on-accent: "#FFFFFF"
  on-success: "#FFFFFF"
  on-danger: "#FFFFFF"
typography:
  title:
    fontFamily: Inter
    fontSize: 2rem
    fontWeight: "700"
    lineHeight: "1.2"
  section:
    fontFamily: Inter
    fontSize: 1.25rem
    fontWeight: "600"
    lineHeight: "1.3"
  body:
    fontFamily: Inter
    fontSize: 1rem
    fontWeight: "400"
    lineHeight: "1.5"
  meta:
    fontFamily: Inter
    fontSize: 0.875rem
    fontWeight: "500"
    lineHeight: "1.4"
rounded:
  sm: 8px
  md: 12px
  lg: 16px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
components:
  page:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    typography: "{typography.body}"
    padding: 24px
  page-header:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.section}"
    rounded: "{rounded.md}"
    padding: 16px
  intake-card:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.primary}"
    rounded: "{rounded.lg}"
    padding: 24px
  intake-field:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.secondary}"
    rounded: "{rounded.md}"
    padding: 16px
  intake-field-focus:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.primary}"
    rounded: "{rounded.md}"
    padding: 16px
  primary-action:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.meta}"
    rounded: "{rounded.md}"
    padding: 12px
  success-badge:
    backgroundColor: "{colors.success}"
    textColor: "{colors.on-success}"
    typography: "{typography.meta}"
    rounded: "{rounded.sm}"
    padding: 8px
  blocker-badge:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.on-danger}"
    typography: "{typography.meta}"
    rounded: "{rounded.sm}"
    padding: 8px
  field-divider:
    backgroundColor: "{colors.border}"
    textColor: "{colors.primary}"
    rounded: "{rounded.sm}"
    padding: 4px
---

## Overview
Project intake should turn messy incoming requests into a structured, reviewable project record without making operators feel like they are filling out a brittle form. The experience should feel calm, legible, and explainable so Product and Engineering can trust the routing output.

## Colors
The intake flow uses a neutral working surface with a single blue action color. Operators should spend most of their time reading and clarifying information, so the UI stays quiet until action or status needs emphasis.

- **Primary** is for the highest-importance copy and labels.
- **Secondary** is for supporting text, hints, and non-blocking metadata.
- **Accent** is reserved for main actions and active guidance.
- **Accent soft** is for focus and selection surfaces that need visibility without alarm.
- **Success** and **Danger** are only for explicit readiness or blocker signals.

## Typography
Typography should keep long-form intake content readable while still making stage changes and reviewer signals obvious. Titles establish context, section headers chunk work, body text carries request detail, and meta text supports pills, buttons, and status labels.

## Layout
The flow should prefer one dominant content column with consistent card spacing and clear grouping by intent. Use tighter spacing inside individual field groups and larger spacing between sections so operators can scan quickly without losing the narrative of the request.

## Shapes
Rounded corners should feel soft but operational, not playful. Cards and inputs use medium-to-large radii to reduce visual harshness, while compact status badges use the smaller radius.

## Components
The intake card is the core workspace container. Intake fields should stay visually stable across request types so structured options feel dependable. Primary actions should stand out immediately when the operator is ready to advance, and success/blocker badges should make workflow state obvious at a glance.

## Do's and Don'ts
- **Do** preserve the structured-intake and explainable-routing model already implemented in `src/lib/project-intake.ts`.
- **Do** keep field groups and routing signals interpretable by Product, Engineering, and QA.
- **Do** link downstream implementation plans when intake schema or routing behavior changes.
- **Don't** introduce decorative colors that compete with action, blocker, or readiness signals.
- **Don't** hide routing consequences behind ambiguous labels or overloaded options.
- **Don't** treat DESIGN.md as a replacement for PRDs, verification scripts, or schema-level implementation details.
