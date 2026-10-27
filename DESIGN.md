# MyGroundOps Design System

## Identity

Operations platform for FedEx Ground ISPs. The aesthetic is **command center meets fintech dashboard** — data-dense, precise, dark where it needs authority, light where it needs clarity. Think Linear, Stripe, Vercel dashboard. Not Salesforce. Not generic SaaS purple gradients.

---

## Color System

### Admin Dashboard
```
Background base:    #0f172a  (slate-900)
Surface:            #1e293b  (slate-800)
Surface elevated:   #334155  (slate-700)
Border:             rgba(255,255,255,0.07)
Text primary:       #f8fafc
Text secondary:     #94a3b8
Text muted:         #475569
Accent green:       #10b981
Accent red:         #ef4444
Accent amber:       #f59e0b
Accent blue:        #3b82f6
Accent indigo:      #6366f1
```

### Driver Portal
```
Background:         #ffffff
Surface:            #f8fafc
Border:             #e2e8f0
Text primary:       #0f172a
Text secondary:     #64748b
Brand purple:       #4D148C → #7B2FC0  (gradient)
Brand purple light: #7B2FC0
```

### Homepage / Marketing
```
Background:         #FAFBF8
Text:               #0A1A0E
Accent green:       #16A34A
Dark:               #0A1A0E
Muted:              #6B7280
```

---

## Typography

**Scale** — never go above what's needed. Dense data surfaces use 11–13px. Reserve large sizes for page titles only.

```
Page title:          28–32px, font-extrabold, tracking-tight
Section heading:     20–24px, font-bold
Card title:          14–16px, font-bold
Label/overline:      10–11px, font-semibold, uppercase, tracking-widest, muted
Body:                13–14px, font-normal
Table cell:          12–13px
Micro/badge:         10–11px, font-bold
```

**Font stack:** `-apple-system, BlinkMacSystemFont, "Inter", sans-serif`

---

## Spacing & Density

This is an **operations tool used under time pressure**. Information density matters more than breathing room.

```
Page padding:        px-6 py-8  (24px / 32px)
Card padding:        px-5 py-4  (compact), px-6 py-6  (standard)
Table cell:          px-4 py-2.5
Gap between cards:   gap-4 (16px) — never gap-6 or gap-8 in data grids
Border radius:       rounded-xl (12px) cards, rounded-lg (8px) inputs/badges, rounded-full pills
```

**Anti-patterns:**
- No `py-12` or `py-16` inside dashboard cards
- No `text-5xl` for metric numbers (use 28–36px max)
- No `gap-8` between data rows
- No full-bleed gradient section backgrounds inside dashboards

---

## Component Rules

### Cards
```
Light mode:  bg-white border border-slate-200/80 rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_16px_rgba(0,0,0,0.04)]
Dark mode:   bg-slate-800/60 border border-white/[0.06] rounded-2xl backdrop-blur-sm
```

### Badges / Pills
- Status badges: colored bg + matching text, `text-[11px] font-bold px-2.5 py-0.5 rounded-full border`
- Never use solid dark backgrounds for status — always tinted (red-50/red-700, emerald-50/emerald-700, etc.)

### Tables
- Header: `text-[11px] font-semibold text-slate-400 uppercase tracking-wider`
- Rows: `divide-y divide-slate-100`, hover: `hover:bg-slate-50`
- Sticky header when >10 rows

### Buttons
```
Primary:   bg-slate-900 text-white hover:bg-slate-700
Danger:    bg-red-600 text-white hover:bg-red-700
Ghost:     border border-slate-200 text-slate-600 hover:bg-slate-50
Active state always: active:scale-[0.97] or active:scale-[0.98]
```

### Inputs
```
px-4 py-2.5 rounded-xl border border-slate-200 text-[13px] outline-none
focus:border-slate-400 focus:ring-2 focus:ring-slate-100 transition
```

### Empty States
Every empty state needs: icon (w-8 h-8 text-slate-200) + message (text-[13px] text-slate-400) + primary action button. Never just text.

---

## Motion & Transitions

- All interactive elements: `transition-all` or `transition-colors`
- Hover scale on cards: `hover:scale-[1.01]` — subtle, never `hover:scale-105`
- Button press: `active:scale-[0.97]`
- Loading spinners: `animate-spin` on `Loader2` from lucide-react
- No `animate-bounce`. No `animate-pulse` on content (only skeleton loaders).
- Skeleton loaders: `bg-slate-200 rounded animate-pulse`

---

## Layout Patterns

### Dashboard Page Structure
```
<AppShell>
  <div className="flex-1 bg-slate-50 min-h-screen">
    <div className="max-w-[1200px] mx-auto px-6 py-8 space-y-6">
      {/* Overline + Title + Actions */}
      {/* KPI strip — 3-4 tiles */}
      {/* Main content */}
    </div>
  </div>
</AppShell>
```

### KPI Strip
```
<div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
  <div className="bg-white rounded-xl border border-slate-200/80 px-5 py-4">
    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Label</p>
    <span className="text-[24px] font-extrabold leading-none text-slate-900">{value}</span>
  </div>
</div>
```

### Page Header Pattern
```
<div>
  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-1">MyGroundOps · Admin</p>
  <h1 className="text-[28px] font-extrabold text-slate-900 tracking-tight leading-none">Page Title</h1>
</div>
```

---

## What NOT to Do

1. **No generic gradient cards** — `bg-gradient-to-br from-blue-500 to-purple-600` is banned for data cards
2. **No emoji in UI** — use lucide-react icons only
3. **No `text-gray-*`** — use `text-slate-*` throughout
4. **No centered text** in data tables or lists
5. **No oversized hero padding** inside dashboards (`py-20` etc.)
6. **No placeholder lorem ipsum** — all copy is real
7. **No `font-light`** — minimum font-normal, prefer font-medium for body
8. **No shadows on dark surfaces** — use border + backdrop-blur instead
9. **No `rounded-3xl`** — maximum `rounded-2xl`
10. **No AI tell-signs**: generic blue CTA buttons, white cards with purple headers, "Get Started" as the only action

---

## Reference Interfaces

Target aesthetic references (ranked):
1. **Linear** — keyboard-driven, precise, dark mode done right
2. **Vercel Dashboard** — data density, minimal chrome, fast
3. **Stripe Dashboard** — information hierarchy, table design
4. **Apple HIG** — spacing discipline, typography clarity

Avoid aesthetic references:
- Generic SaaS (Notion-clone feel)
- Tailwind UI defaults (too recognizable)
- shadcn/ui defaults without customization
