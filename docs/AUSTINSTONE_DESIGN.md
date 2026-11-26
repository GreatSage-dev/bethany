# Design System Specification: The Austin Stone (`austinstone.org`)

Extracted live via Playwright computed-style inspection (`1440x900` desktop and `390x844` mobile) from `https://austinstone.org/` on November 26, 2026. Only patterns appearing 3+ times or anchored directly in the site's root stylesheet variables are promoted to system tokens.

## 1. Design Character and Architecture

The Austin Stone visual language relies on high-contrast editorial restraint. Roughly 90% of any viewport stays on three neutral surfaces (`#FFFFFF`, `#F4F4F4`, `#282828`), letting full-bleed documentary photography and oversized `Proxima Nova` headings carry warmth and presence. Color accents are reserved strictly for ministry identity tags, link states, and seasonal announcement bars (such as `#3C4331` for Advent).

## 2. Color System

### 2.1 Core Neutral Tokens (Extracted from `:root`)

| Token | Hex / Value | Role | Observed Usage |
| :--- | :--- | :--- | :--- |
| `--white` | `#FFFFFF` | Primary light canvas, text on dark, filled CTA on dark | 8 surfaces, 96 text nodes |
| `--lightest-gray` | `#F4F4F4` | Alternate light section surface | 3 section surfaces |
| `--promo-bar-body` | `#E9E9E9` | Body text inside bottom announcement bar | 1 ribbon |
| `--light-button` | `#DFDFDF` | Light hairline borders and subtle control borders | 4 borders |
| `--pinstripe` | `#94979E29` (`rgba(148,151,158,0.16)`) | Subtle section and list dividers | 2 dividers |
| `--white-paragraph` | `#B4BDCA` | Muted secondary copy on dark surfaces | Dark sections |
| `--dolphin` | `#898989` | Muted meta labels and captions | Meta text |
| `--body` / `--dark-medium` | `#5E5E5E` | Default paragraph text on light, outline button border | 21 text nodes, 1px borders |
| `--dark-elevated` | `#3E3E3E` | Elevated dark card / hover surface | Dark surfaces |
| `--darkiesh-button` | `#333333` | Secondary dark control fill | Controls |
| `--dark` | `#282828` | Primary ink on light, dark section and footer canvas, primary filled CTA on light | 382 text nodes, 11 surfaces |
| `--pure-black` | `#000000` | High-contrast utility ink | 17 nodes |

### 2.2 Brand and Ministry Semantic Palette (Extracted from `:root`)

| Token | Hex | Semantic Role |
| :--- | :--- | :--- |
| `--brand-blue` | `#00A3E1` | Interactive links and primary brand highlights (24 text nodes) |
| `--brand-blue-shade` | `#00729D` | Hover/active link state and accessible blue on light (23 text nodes) |
| `--advent-2026` | `#3C4331` | Sticky bottom seasonal announcement ribbon |
| `--counseling` / `--recovery` | `#487A7C` | Care, counseling, and recovery ministry category |
| `--for-the-city` | `#C43B46` | Local outreach / urgent highlight |
| `--for-the-nations` | `#35B887` | Global mission (shade: `--for-the-nations-shade: #1D7A57`) |
| `--institute` | `#224D98` | Theological training / Institute |
| `--college` | `#D1A02A` | College ministry |
| `--kids` | `#E31B48` | Kids ministry |
| `--students` | `#48C2C5` | Students ministry |
| `--men` | `#085E42` | Men's ministry |
| `--women` | `#8C4799` | Women's ministry |
| `--creative` | `#FFD100` | Creative / worship arts |

### 2.3 Border and Opacity Rules

- Standard light hairline: `1px solid #DFDFDF` (or `#94979E29` pinstripe dividers).
- Outline button on light: `1px solid #5E5E5E`.
- Ghost button on dark photography: `2px solid rgba(255, 255, 255, 0.61)`.
- Body copy on dark backgrounds: `rgba(255, 255, 255, 0.90)` or `#FFFFFF`.

## 3. Typography System

- **Primary Font Family:** `"Proxima Nova", Arial, sans-serif` (weights loaded: `400`, `500`, `600`, `700`).
- **Open-Source Substitution:** `Plus Jakarta Sans` or `Montserrat` (geometric humanist sans with similar x-height and circular counters).

### 3.1 Type Scale

| Role | Desktop Size | Line Height | Weight | Tracking | Transform | Mobile Size (`390px`) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Hero / Section Display (`h1`, `h2`) | `48px` (`3rem`) | `57.6px` (`1.2`) | `600` | `normal` | `none` | `38.4px` (`48px` lh) / `32px` |
| Editorial Subhead (`h2` lead) | `27.2px` (`1.7rem`) | `38.4px` (`1.41`) | `500` | `normal` | `none` | `22px` |
| Event Card Title (`h3`) | `27.2px` (`1.7rem`) | `36.8px` (`1.35`) | `600` | `normal` | `none` | `22px` |
| Article Card Title (`h3`) | `22.4px` (`1.4rem`) | `32px` (`1.43`) | `600` | `normal` | `none` | `20px` |
| Body Paragraph (`p`) | `16px` (`1rem`) | `26.72px` (`1.67`) | `400` | `normal` | `none` | `16px` |
| Top Navigation Link | `16px` | `1.5` | `600` | `0.1px` | `capitalize` | Drawer list |
| Large Pill Button | `12.8px` (`0.8rem`) | `1.2` | `600` | `2px` | `uppercase` | `12.8px` |
| Compact Pill Button (Nav / Ribbon) | `12px` (`0.75rem`) | `1.2` | `600` | `3px` | `uppercase` | `12px` |

## 4. Spacing, Layout, and Grid Rhythm

- **Header Geometry:** Fixed top navigation bar (`position: fixed`), `120px` height and `0 72px` horizontal padding on desktop (`48px` height on mobile). Transparent background over the hero photography, transitioning text color to `#282828` on light scroll states.
- **Section Container Padding:** Full-width dark callout and footer bands use `120px` horizontal padding (`padding: 0 120px`) on `1440px` viewports.
- **Vertical Page Cadence:**
  1. Full-bleed dark-scrimmed photographic Hero (`100svh`) with left-aligned headline + two side-by-side pill CTAs (`Visit` filled white + `Get Involved` 2px white outline), paired with a bottom-right sermon media card (`Watch the Latest Sermon`).
  2. Sticky bottom seasonal announcement ribbon (`#3C4331` background, `#E9E9E9` copy, compact white pill CTA, right close button, top shadow `0px -2px 12px rgba(0,0,0,0.18)`).
  3. Open-ground `#FFFFFF` editorial manifesto section (`48px/57.6px` statement).
  4. Full-bleed horizontal photo marquee (`480px` height, `0px` horizontal padding).
  5. Alternating light (`#FFFFFF` / `#F4F4F4`) content grids (events, sermon series, articles).
  6. Full-width `#282828` dark welcome callout (`281px` height) with white headline and twin pill CTAs.
  7. Deep `#282828` dark multi-column footer (`804px` height, `0 120px` padding).

## 5. Repeated Component Specifications (3+ Occurrences)

### 5.1 Pill Buttons (`border-radius: 100px`, 16 instances)

| Variant | Height | Padding | Fill | Text | Border | Typography |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Primary Light (on dark) | `51px` | `16px 32px` | `#FFFFFF` | `#282828` | `none` | `12.8px`, `600`, `2px` tracking, uppercase |
| Primary Dark (on light) | `51px` | `16px 32px` | `#282828` | `#FFFFFF` | `none` | `12.8px`, `600`, `2px` tracking, uppercase |
| Ghost Outline (on dark) | `51px` | `14px 30px` | `transparent` | `#FFFFFF` | `2px solid rgba(255,255,255,0.61)` | `12.8px`, `600`, `2px` tracking, uppercase |
| Hairline Outline (on light) | `51px` | `15px 31px` | `transparent` | `#282828` | `1px solid #5E5E5E` | `12.8px`, `600`, `2px` tracking, uppercase |
| Compact Nav / Ribbon Pill | `43px` | `12px 24px` | `#FFFFFF` or `#282828` | `#282828` or `#FFFFFF` | `none` (or `1px` ghost on footer) | `12px`, `600`, `3px` tracking, uppercase |

### 5.2 Radius Hierarchy

- `4px`: Utility focus links (skip-to-content).
- `8px` (34 instances): Navigation hover pills, dropdown menu items (`padding: 10px 16px`), thumbnails, standard cards.
- `16px` (4 instances): Large media containers and featured series cards.
- `100px` (16 instances): All primary and secondary CTA buttons.

### 5.3 Elevation and Motion

- **Card Shadow (4 instances):** `14px 14px 40px 0px rgba(0, 0, 0, 0.07)` (wide, diffused light-mode ambient elevation; avoid harsh dark drop shadows).
- **Sticky Bottom Bar Shadow:** `0px -2px 12px 0px rgba(0, 0, 0, 0.18)`.
- **Default UI Transition (52 instances):** `200ms` (`opacity 0.2s, background-color 0.2s`).
- **Dropdown Popover (4 instances):** `opacity 150ms, transform 150ms`.
- **Signature Editorial Motion (12 instances):** `480ms cubic-bezier(0.509, -0.005, 0.111, 1.007)` for marquee, nav reveals, and hero/media sweeps.

## 6. Copy-Paste CSS Token Block

```css
:root {
  /* Neutrals */
  --as-white: #ffffff;
  --as-lightest-gray: #f4f4f4;
  --as-promo-body: #e9e9e9;
  --as-border-light: #dfdfdf;
  --as-pinstripe: rgba(148, 151, 158, 0.16);
  --as-muted: #898989;
  --as-body: #5e5e5e;
  --as-dark-elevated: #3e3e3e;
  --as-dark: #282828;

  /* Brand & Ministry Accents */
  --as-blue: #00a3e1;
  --as-blue-shade: #00729d;
  --as-olive-ribbon: #3c4331;
  --as-slate-care: #487a7c;
  --as-crimson: #c43b46;

  /* Typography */
  --as-font-sans: "Proxima Nova", "Plus Jakarta Sans", Arial, sans-serif;
  --as-text-display: 3rem;     /* 48px */
  --as-text-subhead: 1.7rem;   /* 27.2px */
  --as-text-card: 1.4rem;      /* 22.4px */
  --as-text-body: 1rem;        /* 16px */
  --as-text-btn-lg: 0.8rem;    /* 12.8px */
  --as-text-btn-sm: 0.75rem;   /* 12px */

  /* Radii & Depth */
  --as-radius-sm: 8px;
  --as-radius-lg: 16px;
  --as-radius-pill: 100px;
  --as-shadow-card: 14px 14px 40px 0px rgba(0, 0, 0, 0.07);
  --as-shadow-ribbon: 0px -2px 12px 0px rgba(0, 0, 0, 0.18);

  /* Motion */
  --as-ease-editorial: cubic-bezier(0.509, -0.005, 0.111, 1.007);
  --as-dur-fast: 150ms;
  --as-dur-base: 200ms;
  --as-dur-editorial: 480ms;
}
```

## 7. Notable Differences vs. Bethany's Calibrated System

When adapting Austin Stone's language for Bethany (`public/styles.css`), we intentionally kept its calm neutral architecture, editorial photography, pill CTAs, `#3C4331` olive anchor, and `#487A7C` / `#C43B46` care/crisis palette while refining three points via `unslop`:
1. Replaced uppercase tracked pill labels (`2px–3px` tracking) with sentence-case buttons (`0` tracking) for cleaner legibility across both landing and interactive app surfaces.
2. Shifted `Proxima Nova` weight `600` headings to open-source `Plus Jakarta Sans` weight `500` plus `JetBrains Mono` (`tabular-nums`) for phone numbers, timers, and RBAC payloads.
3. Kept interactive controls inside `/phone` on an `8px` nested radius system rather than making every dashboard control a `100px` pill.
