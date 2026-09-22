---
name: PaperPilot Research Platform
description: Evidence-led scientific planning, procurement, and experiment services in one calm workbench.
colors:
  research-ink: "#183830"
  ink-soft: "#50635b"
  paper: "#f6f8f5"
  panel: "#ffffff"
  line: "#e3e9e3"
  muted: "#65776e"
  evidence-mint: "#d9ef8b"
  selected-surface: "#eaf0e5"
typography:
  display:
    fontFamily: "DM Sans, Microsoft YaHei, PingFang SC, sans-serif"
    fontSize: "32px"
    fontWeight: 650
    lineHeight: 1.32
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "DM Sans, Microsoft YaHei, PingFang SC, sans-serif"
    fontSize: "26px"
    fontWeight: 650
    lineHeight: 1.4
    letterSpacing: "-0.035em"
  body:
    fontFamily: "DM Sans, Microsoft YaHei, PingFang SC, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.75
  label:
    fontFamily: "DM Sans, Microsoft YaHei, PingFang SC, sans-serif"
    fontSize: "10px"
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: "1.3px"
rounded:
  control: "8px"
  card: "12px"
  feature: "16px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "28px"
components:
  button-primary:
    backgroundColor: "{colors.research-ink}"
    textColor: "{colors.panel}"
    rounded: "{rounded.control}"
    padding: "10px 16px"
    height: "38px"
  card:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.research-ink}"
    rounded: "{rounded.card}"
    padding: "18px"
  input:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.research-ink}"
    rounded: "{rounded.control}"
    padding: "12px 14px"
---

# Design System: PaperPilot Research Platform

## Overview

**Creative North Star: "The Evidence Workbench"**

PaperPilot feels like a composed scientific workbench: pale paper surfaces, deep green instruments, and restrained evidence markers. The interface is compact enough for repeated research work while preserving clear reading order from source evidence to an ordered method and then to an action.

The system uses familiar scientific forms rather than decorative laboratory imagery. Hierarchy comes from typography, tonal panels, numbered branches, and deliberate density. Interactive states remain quiet and direct.

**Key Characteristics:**
- Evidence before action
- Deep research green with rare yellow-green emphasis
- Flat, bordered surfaces and compact information density
- Numbered method branches as the signature geometry
- Responsive reflow without horizontal page overflow

## Colors

The palette combines botanical research greens with neutral paper tones so dense evidence remains readable for long sessions.

### Primary
- **Research Ink:** structural navigation, primary buttons, the research brief, and the selected-experiment dock.

### Secondary
- **Evidence Mint:** sparse emphasis for primary outcomes, counts, and key actions on dark surfaces.

### Neutral
- **Paper:** the application canvas.
- **Panel:** evidence rows, cards, dialogs, and inputs.
- **Ink Soft:** secondary body copy.
- **Line:** borders and sequence connectors.
- **Muted:** labels and supporting metadata.

**The Evidence Accent Rule.** Evidence Mint is reserved for consequential actions or outcome counts; it never fills a whole content region.

## Typography

**Display Font:** DM Sans with Microsoft YaHei and PingFang SC fallbacks  
**Body Font:** DM Sans with Microsoft YaHei and PingFang SC fallbacks

**Character:** A neutral, contemporary sans-serif supports bilingual research content without a decorative display face. Weight and spacing establish hierarchy; body copy stays comfortable at dense sizes.

### Hierarchy
- **Display** (650, 32px, 1.32): the research brief thesis.
- **Headline** (650, 26px, 1.4): page titles.
- **Title** (600–650, 14–21px): section and method titles.
- **Body** (400, 11–13px, 1.75): evidence summaries and explanations.
- **Label** (600, 9–10px, 1.3px tracking): steps, provenance, categories, and system state.

**The Long-Evidence Rule.** Reduce metadata before body copy; never compress Methods evidence below a readable line height.

## Layout

Desktop uses a fixed 222px navigation rail and a fluid work area. Main views cap at roughly 1380–1480px. The research page moves from a two-column brief to a full-width evidence list, then to a method tree plus a 300px sticky selection dock. The primary spacing rhythm is 8, 12, 16, 24, and 28px.

At 1100px the brief becomes one column. At 760px the sidebar becomes a five-item bottom navigation, method resources stack vertically, the category summary becomes a horizontal strip, and the selection dock returns to document flow. Tap targets remain at least 40–44px.

## Elevation & Depth

The system is flat by default. Depth comes from pale tonal changes, one-pixel borders, and sticky positioning. Shadows are limited to transient overlays, the chat composer, and menus.

**The Flat Workbench Rule.** Persistent scientific content uses borders and surface tones; shadows belong to temporary layers.

## Shapes

Controls use gently curved 8px corners, content cards use 12px, and the research brief uses 16px. Circular numbered nodes are reserved for sequence and position. Borders remain thin and low contrast.

## Components

### Buttons
- **Shape:** compact controls with an 8px radius.
- **Primary:** Research Ink with white text; Evidence Mint replaces it only inside the dark selection dock.
- **Hover / Focus:** subtle tonal shift and a two-pixel green focus outline.
- **Secondary:** transparent or white with a quiet border.

### Chips
- **Style:** pale green or neutral fills with 5px corners and compact label text.
- **State:** semantic status uses text plus tone; verification is never communicated by color alone.

### Cards / Containers
- **Corner Style:** 12px for persistent panels.
- **Background:** Panel on Paper, or Selected Surface for grouped evidence.
- **Shadow Strategy:** none at rest.
- **Border:** one-pixel Line.
- **Internal Padding:** 18–24px on desktop and 15–18px on mobile.

### Inputs / Fields
- **Style:** white or subtly tinted field, one-pixel border, 8px radius.
- **Focus:** green outline with clear offset.
- **Error / Disabled:** explicit copy with reduced opacity only for disabled actions.

### Navigation
- Desktop navigation sits on a pale green rail with a filled active row. Mobile uses five evenly distributed destinations on a pale bottom bar. Icons are Lucide line icons with consistent stroke weight.

### Ordered Methods Tree
- Each method receives a numbered circular branch, a category label, evidence support count, and separate reagent and material groups.
- Checking a method selects its resources. Catalog matching is shown as a separate marketplace state and never implied by model output.

## Do's and Don'ts

### Do:
- **Do** keep the evidence-to-method-to-action reading order visible.
- **Do** show provenance counts and indicate whether evidence came from an abstract or full Methods section.
- **Do** use numbered branches for executable sequences.
- **Do** keep service pricing and delivery as inquiry states until a provider confirms them.

### Don't:
- **Don't** turn the main research flow into a generic chatbot screen.
- **Don't** invent catalog SKUs, laboratory ratings, prices, or schedules.
- **Don't** cover dense evidence with gradients, decorative science imagery, or heavy shadows.
- **Don't** hide missing full text; label the evidence scope directly.
