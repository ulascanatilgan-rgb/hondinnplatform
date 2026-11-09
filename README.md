# HONDINN PLATFORM

Private, responsive operations workspace for Hondinn Boutique Dog Hotel. A lightweight Node.js application with no npm dependencies. Designed for mobile, desktop, and GitHub → Railway deployment.

## Sections

- **Overview:** live number of dogs, upcoming stays, clients, projects, and a compact **Check List** for shared current tasks. Tick tasks complete; add due dates and notes, edit, delete, and view all. All changes persist in the server database.
- **Reservations Calendar:** month navigation, daily dog counts, overnight/daycare/trial bookings, edit/delete, and **maximum 4 dogs** per occupied day.
- **Dog Clients:** dog and owner contacts, notes, emergency contact, vaccine expiry dates.
- **Ideas:** add, edit, archive by status, delete.
- **Projects:** seeded with Hondinn Hamam, Dog Taxi, RoboHond. Notes, research cards, externally sourced inspiration images, reference uploads.
- **Renovations:** Stairs, Dog Rooms, Dog Kitchen, Dog Bathroom & Corridor, Garden. Images, notes, additional areas.
- **Activities & Walks:** records and photo uploads; walking app connection placeholder.
- **News & Insights:** server fetches the latest five RSS headlines from Google News searches focused on canine care and boarding; Update button, archived prior headlines, and automatic refresh after >24 h when News is opened. **Requires external internet access at runtime.** If unavailable, a visible error is shown; no invented headlines.
- **Forms & Documents:** PDF and photo uploads (max 15 MB each), owner/dog assignment, downloads and deletion.
- **Camera:** Arlo connection placeholder and link to official Arlo portal; no live feed yet.
- **PawPass:** integration placeholder, optional link via environment setting.

## Quick start

Requires Node.js **20 or later**.

```bash
cd hondinn-platform
npm start
```

Open `http://localhost:3000`.

In local development, an unset `APP_PASSWORD` enables an **unprotected local demo only**. **Never expose that development configuration to the public internet.**

Set a password for the local instance:

```bash
APP_PASSWORD='your-long-private-password' node server.js
```

## GitHub and Railway

1. Create a **private** GitHub repository and upload this project's contents (not the outer ZIP).
2. Create a Railway project: **Deploy from GitHub Repo**, and select that repository.
3. Railway will execute `npm start` from `package.json` (Node 20+). It binds to Railway's provided `PORT`.
4. Set Railway variables `NODE_ENV=production`, `APP_PASSWORD=<a long unique password>` and `SESSION_SECRET=<a separate long random secret>`.
5. Add a **Railway Volume** mounted at `/data`, then set `DATA_DIR=/data`. **Without this volume, uploads and records may be erased during a redeploy or restart.**
6. Generate an HTTPS public domain from Railway, then open that URL on your phone and desktop. Log in using the same password; both see the same saved records.
7. On iPhone in Safari: Share → **Add to Home Screen**. On Chrome desktop or Android: choose **Install app** when offered.

### Optional integration links

Configure these optional Railway variables when the respective services are ready:

- `PAWPASS_URL=https://...`
- `WALK_APP_URL=https://...`
- `ARLO_URL=https://my.arlo.com/`

Arlo videos are **not** integrated. Official Arlo API/OAuth and camera account permissions would need a separate implementation. Connecting a walking app will also require an API or import format.

## Data and privacy

Data is stored in `{DATA_DIR}/database.json`. Documents and uploaded images are stored under `{DATA_DIR}/uploads/`. The password gate uses a 14-day signed, HttpOnly, SameSite=Lax cookie. HTTPS is required in production. Uploads are accessible only after login and stored outside the public web directory.

**Important:** This is an operational **MVP**, not a fully audited production system for sensitive customer records. Before collecting signed agreements, dog-health information or other personal data, implement appropriate GDPR retention/consent notices, secure backups, access logs, account-level permissions (separate owner/spouse accounts), password rotation and a disaster recovery process. Railway volumes persist files but are **not a substitute for independent off-platform backups**. Google Cloud Storage is not yet connected. This version has a shared household login rather than two separate accounts.

The images in Projects are remote references linking to their source. Obtain permission/licensing before reusing any third-party media in public marketing. Hondinn typography/brand mark are based on the publicly available brand identity, not a verified copy of the original logo asset. Replace the monogram with the genuine logo file when available.

## API overview

All private API routes require the password session when `APP_PASSWORD` is set.

- `GET /api/config`, `POST /api/login`, `POST /api/logout`
- `GET /api/state`
- `POST /api/item`, `DELETE /api/item`
- `POST /api/note`
- `POST /api/upload`, `GET /api/files/:id`, `DELETE /api/file`
- `GET /api/news`, `POST /api/news/refresh`

Client and reservation creation are empty until you enter real data. No fake clients or bookings are prepopulated.

## Safety rules for bookings

Each reservation is for one dog. Daycare occupies its check-in date; overnight/trial bookings occupy the nights from check-in up to, but not including, check-out. The server enforces the 4-dog limit for any non-cancelled booking and rejects a fifth. This is not yet a full kennel-management scheduler: it does not automatically verify vaccination validity at check-in, availability by room, dog compatibility, or check-in/out time windows.