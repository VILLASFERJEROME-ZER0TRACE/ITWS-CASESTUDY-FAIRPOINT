# FairPoint: Campus Student Complaint & Session Management System

A single-page prototype built with plain HTML5, CSS3 (theme variables) and vanilla JavaScript.
There is no backend and no build step. Everything is saved in the browser's `localStorage`.

## How to run

1. Unzip the folder and keep all files together.
2. Double-click `index.html` to open it in Chrome, Edge, Firefox or Safari.

Optional, if you prefer a local server (VS Code "Live Server" also works):

```bash
cd fairpoint
python -m http.server 8000
# then open http://localhost:8000
```

## Demo logins (no real authentication, so any ID works)

| Portal | ID | Password |
|---|---|---|
| Student Portal | `2023-1001` (has sample cases), `2023-1002`, `2023-1003`, or any ID | any value |
| Judicial Admin Portal | `ADMIN-001` or any ID | any value |

Sample complaints and sessions are created on first load. **Reset demo data** on the sign-in screen restores them.

## Quick test flow

1. Sign in as a student (`2023-1001`) and open **File a Complaint**. Submit one, then check **Schedule Tracker**.
2. Sign in as another student (`2023-1002`). You will not see the first student's complaints.
3. Sign in as `ADMIN-001`. Open the **Complaint Board**, click **Review**, and send a response.
4. Click **Schedule**, fill in date, time and venue, then **Publish to student**.
5. Sign back in as the first student. The response and session are on the tracker.

Tip: open the student and admin portals in two tabs. When the admin publishes, the student tab updates
instantly and shows a notification (login is stored per tab, data is shared).

## Features

**Student Portal**
- Complaint form: complainant (name, student ID, course, section), optional respondent, incident description.
- Student ID comes from the login, so a complaint is tied only to that student.
- Privacy: every student sees only their own complaints. Only the admin sees all of them.
- Schedule Tracker: status, admin responses and published hearing dates for the student's own cases.

**Judicial Admin Portal**
- Complaint Review Board: all complaints with complainant and respondent details, full incident text,
  search and status filter.
- Case response: reply to a complaint and update its status.
- Session scheduling: set, update and publish hearing or talk sessions (date, time, venue, notes).
  Drafts stay hidden. Publishing makes the session appear on that student's tracker immediately.
  Each case has one session, so saving again updates it.

## Files

| File | Purpose |
|---|---|
| `index.html` | Page structure (sign-in, both portals, case dialog) |
| `styles.css` | Styling. Change the colours in the `:root` variables at the top to re-theme |
| `app.js` | All logic: sample data, login, filing, responses, scheduling, localStorage |
| `logo.png`, `favicon.png` | FairPoint logo (shown beside the name) and browser tab icon |

## Notes

- Data keys: `fairpoint.v1.db` (localStorage, shared) and `fairpoint.v1.user` (sessionStorage, per tab).
  To wipe everything, clear site data or use **Reset demo data**.
- This is a demo. Passwords are not checked and data is not encrypted, so do not enter real personal information.
