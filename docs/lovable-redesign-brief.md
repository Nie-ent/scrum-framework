# Pace — redesign brief for Lovable

Pace (pacescrum.com) is a Thai-language web app where one person or a team keeps tasks, a daily check-in, and notes in one place. This brief asks you to redesign its interface. The product logic already exists and works; what we need from you is a better-looking, easier-to-use UI that we will port back into the real codebase.

## What to build

Build a **clickable front-end prototype with mock data**: every screen listed below, navigable, responsive, in Thai. Do not build a backend, authentication, or a database. Use hard-coded sample data in one file so we can see realistic states.

The prototype is finished when:

- every screen in "Screens" exists and is reachable from the navigation;
- it works at 390 px (phone) and 1440 px (desktop) with no horizontal scrolling;
- each screen shows its empty state, a normal state, and (where relevant) an error state;
- the navigation follows the structure you chose in "Navigation: the main open question", and you explain that choice in a short note on a `/design-notes` page;
- all visible text is Thai, using the vocabulary in "Words to use".

## Who uses it

Two kinds of people, and the design has to serve both without two separate products:

1. **A person on their own** — not technical. They want to write down what to do, set due dates, tick things off, and keep notes. They have never heard of "scrum" or "Markdown".
2. **A small team (3–15 people)** — a lead assigns work, members report daily progress, everyone shares notes and files.

Every account has a private **personal space** (`พื้นที่ส่วนตัว`) and can belong to any number of teams. Tasks, check-ins, notes, calendar, files and stats exist once per space. The user switches between spaces; the screens are the same.

Most use is on a phone during the day and on a laptop when planning. Phone layout is not a reduced version — it is the main one for check-in and ticking off tasks.

## Why we are redesigning

The current UI grew feature by feature. Specific problems to solve:

- **Too many menu items at the same level.** The sidebar has ten entries (see below); on a phone only five fit, so the rest are reached through buttons scattered on other pages. Users cannot predict where something lives.
- **The space switcher is a row of tabs repeated on every page.** With several teams it wraps and pushes content down.
- **Dense rows.** A task row holds title, due date, assigner, progress bar, reason field, percent field, save button, delete button, attachments, linked notes and a comment thread. It reads as a form, not a list.
- **Everything looks equally important.** Cards, borders and shadows are uniform, so the eye has no starting point.
- **No guidance.** Icons-only buttons and less obvious features (flagging a file to keep it, linking a note to a task) have no explanation.

Keep the calm, light, professional tone. This is a work tool people open every day; it should feel quiet and fast, not decorative.

## Current visual language

Keep or evolve these; do not start from an unrelated style.

- Font: **IBM Plex Sans Thai** (400/500/600/700). Thai text needs a little more line height than Latin — body text at least 1.6.
- Primary colour: indigo (`#4f46e5`). Status colours: emerald = done/good, amber = waiting/warning, rose = overdue/needs help, slate = neutral.
- Page background `#f7f8fc`, white cards, 16 px radius, very soft shadows.
- Buttons 40 px tall minimum; touch targets 44 px on phone.
- Line icons, 1.6 stroke (Heroicons outline style). No emoji as icons.

The real app uses Next.js, React 19 and Tailwind CSS 4. Build the prototype with React and Tailwind so components can be carried over. Use plain Tailwind utility classes and small, single-purpose components; avoid UI kits that bring their own design system we would have to remove.

## Navigation: the main open question

We want your recommendation on how to arrange the menu: which items stand alone and which are combined.

**Today's menu (desktop sidebar, in order):**

| Item (Thai) | Route | What it is | Who sees it |
|---|---|---|---|
| เช็กอิน | `/standup` | Daily check-in / personal daily log | everyone |
| งาน | `/tasks` | Task list, assign, update progress | everyone |
| ปฏิทิน | `/calendar` | Month view of tasks by due date | everyone |
| โน้ต | `/notes` | Folders, notes, links between notes | everyone |
| ไฟล์สำคัญ | `/files` | Files flagged to keep | everyone |
| ภาพรวมทีม | `/dashboard` | Who checked in, who needs help | team leads/owners only |
| สถิติ | `/stats` | Check-in rate, streak, tasks done | everyone |
| ทีม | `/teams` | Spaces, invitations, create a team | everyone |
| แจ้งเตือน | `/notifications` | In-app notifications (unread badge) | everyone |
| บัญชี | `/account` | Profile, password, notification settings | everyone |
| Admin | `/admin` | Platform administration | platform admins only |

Phone bottom bar today: เช็กอิน · งาน · โน้ต · ภาพรวม (leads) · ทีม · บัญชี, plus a bell in the top bar.

**Our suggested grouping** — treat it as a starting point, improve it if you see something better, and say why:

| Top-level item | Contains | Reasoning |
|---|---|---|
| **วันนี้** (Today) | check-in form, my tasks due today/overdue, today's meeting link | The one screen a person opens every morning |
| **งาน** (Tasks) | list view, calendar view, kept files — as tabs/views of the same data | Calendar and files are other views of tasks, not separate destinations |
| **โน้ต** (Notes) | folder tree, note, relationship graph | Stands alone; it is a different mode of work (reading/writing) |
| **ทีม** (Team) | overview, stats, members & invitations, team settings | Everything about other people; hidden or reduced in the personal space |
| Top bar | space switcher, search, notifications bell, account avatar menu | Global things that are not destinations |

Constraints for whatever structure you choose:

- At most **five** destinations in the phone bottom bar.
- The **space switcher** appears once, in a fixed place (top bar or top of sidebar), not on every page. It lists the user's teams and their personal space; sub-teams are indented under their parent team.
- In the personal space, team-only things (overview of other people, members, invitations) must not show empty shells — hide them or replace them with something useful.
- A team lead needs the team overview within one tap from anywhere.
- Notifications and account are reachable from every screen but are not primary destinations.

## Screens

For each screen: purpose, what is on it today, and what to improve. Routes are the real ones; keep them so the port is mechanical.

### Sign in, sign up, password — `/login`, `/signup`, `/forgot-password`, `/reset-password/[token]`, `/invite/[token]`

Centred card with logo. Sign-in has email, password, "จดจำฉันไว้ในเครื่องนี้ (30 วัน)". Field errors appear under the field. The invite page shows the team name and who invited, with "สมัครบัญชีใหม่เพื่อเข้าทีม" and "มีบัญชีแล้ว — เข้าสู่ระบบ".

Improve: make the first screen explain in one line what Pace is for. Sign-up should make clear you can use it alone straight away.

### Check-in — `/standup`

The daily ritual. Two lists and an optional section:

- **ล่าสุดทำอะไรไป** — lines carried over from yesterday's plan; each has a done checkbox and a percent (0–100).
- **วันนี้จะทำอะไร** — unfinished lines carry over automatically; the user adds new ones. A typed line becomes a real task.
- Optional, collapsed: **ต้องการความช่วยเหลือ**, **สิ่งที่ควรปรับปรุง**, **สิ่งที่ไปได้ดี**.
- Chips of the user's open tasks not yet in the check-in; tap to add.
- Below the form (teams only): today's check-ins from teammates, each with a comment thread.
- Side column: the user's last 15 check-ins.

In the personal space the page is titled **บันทึกประจำวัน** and has no teammate section.

Improve: this must be completable in under a minute on a phone with one thumb. Percent entry is fiddly (a number field per line) — consider a slider, quick steps (0/25/50/75/100), or tap-to-cycle. Long lists (10+ lines) must stay scannable.

### Tasks — `/tasks`

Add/assign form at top (title, description, assignee for leads, due date, attach files). Below, open tasks grouped by person, the user's own group first; finished tasks collapsed at the bottom.

Each task has: number (`#12`), title, description, due date (overdue highlighted), who assigned it, progress bar + percent, an optional reason when updating percent, attachments, notes that reference it, and a comment thread. Progress changes are recorded in the thread as "40% → 65%" with the reason.

Improve: show a compact row (checkbox or progress ring, number, title, due date, assignee avatar, comment count) and move everything else into a detail panel (side sheet on desktop, full screen on phone). Adding a task should be one field and Enter, with details optional.

### Calendar — `/calendar`

Month grid, tasks on their due date, coloured: mine, others', overdue, done. Hover a day → "+" opens the add-task form with that date. Below: this month's tasks by day with a date picker to reschedule, and tasks with no due date.

Improve: design this as a view inside Tasks. On phone a month grid is too small — propose a week strip plus agenda list. Dragging a task to another day is welcome on desktop.

### Notes — `/notes`, `/notes/[id]`, `/notes/graph`

Left: folder tree (nested folders and notes), search, "new note / new folder". Right: the note.

Reading a note: title, last editor and time, content, then two panels — **โน้ตที่ลิงก์มาที่นี่** (backlinks) and **งานที่โน้ตนี้อ้างถึง** (linked tasks) — and move/delete.

Editing: a rich-text editor (see "Note editor" below). Links to other notes and to tasks appear as coloured chips.

Graph: notes and referenced tasks as dots joined by lines; click a dot to open it.

Improve: reading should feel like a document, not a form in a card — generous width (about 70 characters), clear typographic hierarchy. Backlinks and linked tasks belong in a quiet right-hand rail on desktop. On phone the tree should be a drawer, not a block above or below the note.

### Kept files — `/files`

Attachments on tasks and comments are temporary (deleted after 7 days) unless someone flags them as important. This page lists the flagged ones per space, with where each came from.

Improve: design as a view inside Tasks. The temporary/kept idea is unusual — the file chip must make "expires in N days" and "kept" obvious, and flagging must be discoverable (today it is a right-click menu or a "⋯" button).

### Team overview — `/dashboard`, `/dashboard/member/[id]` (leads and owners)

For a chosen day and team: how many checked in, who asked for help, who has not checked in, improvement/went-well notes, per-person cards with yesterday/today/help, a 7-day submission grid, and a link to each person's history.

Improve: lead with what needs action (people asking for help, people who have not checked in), then the rest.

### Stats — `/stats`

Periods 7/30/90 days. "ของฉัน": check-in rate, streak, tasks done, comments. "ทั้งทีม": the same as team totals. Leads also see a per-person table. It is deliberately framed as "who might need support", not a performance score — keep that tone; no rankings, no red/green judgement of people.

### Team — `/teams`, `/teams/[id]`

`/teams`: the personal space, the user's teams with their role in each, pending invitations (accept/decline), create a team.

`/teams/[id]` (leads/owners): invite by email with role title and access level (สมาชิก / หัวหน้าทีม / เจ้าของทีม), pending invitations with a copyable link, member list with editable role title, access and "takes part in check-in", meeting link, sub-teams, and delete team (must type the team name).

### Notifications — `/notifications`

List, unread highlighted, "mark all read". Types: new task assigned, comment, progress update, invitation, team deleted.

Improve: a dropdown panel from the bell on desktop; full page on phone.

### Account — `/account`

Profile (name, photo), link to teams, push notification toggle for this device, email notification toggle with verification status, change password, sign out.

### Admin — `/admin` (platform admins)

Users, roles, teams. Low priority; make it consistent, nothing more.

## Note editor

The editor is already WYSIWYG (Tiptap). It stores Markdown behind the scenes, but users never need to know that. Design it for people who have only used Word or LINE.

**Typing shortcuts that already work** — they need to be discoverable, which is the design task:

| Type this at the start of a line | Result |
|---|---|
| `# ` then space | Heading 1 |
| `## ` | Heading 2 (sub-heading) |
| `### ` | Heading 3 |
| `- ` or `* ` | Bullet list |
| `1. ` | Numbered list |
| `[ ] ` | To-do item with a checkbox |
| `> ` | Quote |
| ` ``` ` | Code block |
| `---` | Divider line |
| `**text**` | Bold |
| `*text*` | Italic |
| `~~text~~` | Strikethrough |

| Keys (⌘ on Mac, Ctrl on Windows) | Result |
|---|---|
| ⌘B / ⌘I | Bold / italic |
| ⌘⇧S | Strikethrough |
| ⌘⌥1, ⌘⌥2, ⌘⌥3 | Heading 1 / 2 / 3 |
| ⌘⇧8 / ⌘⇧7 / ⌘⇧9 | Bullet list / numbered list / to-do list |
| ⌘⇧B | Quote |
| ⌘Z / ⌘⇧Z | Undo / redo |
| Tab / ⇧Tab in a list | Indent / outdent |

**Please design:**

1. **A "/" command menu.** Typing `/` on an empty line opens a small list — หัวข้อใหญ่, หัวข้อรอง, รายการ, สิ่งที่ต้องทำ, ตาราง, อ้างอิง, เชื่อมไปโน้ต, เชื่อมไปงาน — filterable by typing, each row showing its shortcut on the right. This is the main way a non-technical user discovers formatting.
2. **Link pickers.** Typing `[[` opens a list of note titles; typing `#` followed by a digit opens a list of tasks. Choosing one inserts a chip. A title that does not exist yet offers "สร้างโน้ต '…'".
3. **A floating toolbar on text selection** (bold, italic, strike, link, turn into heading/list), so the fixed toolbar can be smaller.
4. **A shortcut sheet** opened with `?` or a "คีย์ลัด" button, listing the two tables above in Thai.
5. **Phone editing:** a toolbar that sits above the keyboard with the six most-used actions and a "more" button.
6. **Chips** for links: existing note (indigo), note not created yet (dashed outline), task (emerald, shows `#12`). Hover on desktop shows a small preview card (note: title and first lines; task: title, progress, assignee).

## Tooltips (next phase — design the pattern now)

We will add tooltips after the redesign. Define one tooltip component and the rules for using it, and apply it across the prototype.

- **Icon-only buttons** always have a tooltip with the action name, and the keyboard shortcut if one exists (for example `ตัวหนา  ⌘B`).
- **Unfamiliar concepts** get a small "?" affordance with a one- or two-sentence explanation: temporary vs kept files, "takes part in check-in", access levels, percent carry-over in check-in, linking notes to tasks.
- **Truncated text** (long task titles, file names) shows the full text on hover.
- Appears after ~400 ms on hover and immediately on keyboard focus; never contains information that is available nowhere else; never blocks the control it describes.
- **Phone:** no hover. Icon buttons get visible labels where space allows; explanations open on tap of the "?".
- Thai copy, sentence case, no full stop for single phrases, at most ~80 characters.

Also propose **first-run hints**: three or four dismissible coach marks for a new account (where the personal space is, how to add a task, how to check in, how to create a team). They must be skippable in one tap and never return once dismissed.

## Words to use

Use these exact Thai terms; do not reintroduce the jargon on the right.

| Use | Not |
|---|---|
| เช็กอิน, เช็กอินประจำวัน | Daily Scrum, standup |
| บันทึกประจำวัน (personal space) | — |
| งาน | task, ticket |
| ติดปัญหา, ขอความช่วยเหลือ | blocker |
| ทำเครื่องหมายว่าสำคัญ | mark |
| พื้นที่ส่วนตัว, ทีม, พื้นที่ | workspace |
| โน้ต, โฟลเดอร์, เชื่อมไปโน้ต | Markdown, wiki link |
| หัวหน้าทีม, เจ้าของทีม, สมาชิก | admin, role level |

Dates are shown in Thai with Buddhist-era years (`จ. 12 ต.ค. 2569`). The week starts on Sunday. Percentages and counts use Arabic numerals.

## States and details to include

- Empty states for a brand-new account: no tasks, no notes, no check-in history, no teams. Each should say what the screen is for and offer the first action.
- Loading skeletons for lists.
- Success and error feedback after saving (inline near the control, plus a short toast for actions that navigate away).
- Destructive actions (delete task, delete note, delete team, remove member): delete task and note use an undo toast; delete team requires typing the team name.
- A task that is overdue, a task at 100%, a check-in where someone asked for help, a file about to expire, an unread notification, an invitation waiting.
- Keyboard focus styles on everything interactive; colour is never the only signal for status (pair it with an icon or word).

## Mock data

Include one personal space and two teams, one of them with a sub-team; six people with Thai names and varied roles (ผู้จัดการ, นักออกแบบ, นักพัฒนา, ฝ่ายขาย); about fifteen tasks across states with numbers like `#12`; a week of check-ins with one person asking for help; five notes in two folders with links between them and to tasks; three notifications; one pending invitation.

## Do not change

- Routes and what each screen does. Combine screens through navigation and tabs, not by removing features.
- The product rules described above (personal space is private; files expire unless kept; a line typed in a check-in becomes a task; progress is 0–100).
- Thai as the interface language.

## What we will do with the result

We port your components and styles into the existing Next.js app screen by screen. To make that easy: keep one component per file, keep presentational components free of data fetching (props in, markup out), put all sample data in a single module, and put colours, spacing and type sizes in Tailwind theme tokens rather than one-off values.
