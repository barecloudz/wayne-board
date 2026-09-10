# Driver Portal Redesign — 2026-09-09

## Goal
Rebuild the driver portal navigation from a 4-tab + hidden More sheet into a 5-tab mobile-native bottom nav. Every feature is reachable in one tap. Gamification (streak, rank) surfaces on the Home tab landing screen.

## Current State
- Bottom dock: Score | Schedule | Codes | More
- More sheet: Service, Maintenance, Reviews, Milestones, Bonuses, Leaderboard
- Account: only reachable via profile circle (no dock entry)

## New Navigation Architecture

| Tab | Key | Condition |
|-----|-----|-----------|
| Home | `home` | always |
| Schedule | `schedule` | always |
| Codes | `codes` | always |
| Score | `score` | `showRyde === true` only |
| Me | `me` | always |

## Tab Contents

### Home
- Greeting + today's date
- Today's shift card: "Working Today" / "Day Off" / "No Schedule"
- Streak badge 🔥 (when streakDays > 0)
- Ryde rank pill "#N this week" (when showRyde + leaderboard data)
- Ryde score ring (when showRyde + reviews exist)
- Work area badge

### Schedule
- Month label, 2-week calendar, time off list

### Codes
- Gate codes by area (empty areas collapsed)

### Score
- Ryde avg, leaderboard, reviews with filter pills, DSW stats

### Me
- Milestones + bonuses (when showMilestones)
- Maintenance request form
- Account (username + password change)

## Bottom Dock
- 5 tabs (4 when Score hidden)
- Active: filled icon + brand-color label + top indicator bar
- Inactive: outline icon + muted label
- No More button or sheet

## Files Touched
- `app/driver/driver-tabs.tsx` — full nav rebuild (primary file)
- `app/driver/service-tab.tsx` — content moved into Score tab
- `app/driver/maintenance-tab.tsx` — content moved into Me tab

## Out of Scope
- No new API routes, no DB changes, no new dependencies
- Props from `app/driver/page.tsx` unchanged
