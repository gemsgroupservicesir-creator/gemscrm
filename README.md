# GEMS Group Services site

An editable React site for GEMS Group Services with a connected lead-management dashboard. The responsive site keeps its images in `public/images` so the preview does not rely on external assets. It includes the home page, About, Contact, Universities, Scholarships, student guides, six university profiles, and seven article routes.

## Run it locally

```sh
npm install --cache ../../work/npm-cache
npm run dev
```

Open the local address printed by Vite. Public pages do not show a CRM dashboard link. The CRM backend runs as Vercel Functions, so local CRM use requires `vercel dev` linked to the Vercel project with its database environment variables. A plain Vite dev server serves the public site only.

The `/crm` dashboard supports searching, filtering, changing stages, updating notes, adding leads, and exporting visible leads to CSV. In **Website editor**, manage the home page banners, university cards, testimonials, and page copy. Lead records, counselor accounts, attendance, campaign pages, and website edits use the server API and Postgres database; counselor permissions and lead ownership are enforced by that API.

The **Website editor → University profiles** section lets you add, edit, and remove university profiles. Each profile has its own URL name, introduction, image, and study options; the Universities directory links to the saved profiles.

The **Landing pages** section builds campaign pages with configurable copy, two color styles, and optional phone, course, and student-image fields. Forms always collect a name and email address. Uploaded images are resized before saving; leads show the image and selected course in the CRM. Publish a page to create a `/landing/<page-link>/` route. The server assigns each submission using the campaign's saved counselor; draft previews do not save submissions.

Counselors have an **Attendance** section that records sign-in and sign-out times, totals each local calendar day, and tracks progress toward an 8-hour target. Admins can view all counselor attendance; each counselor sees only their own attendance.

The API stores only hashed session tokens and scrypt-hashed passwords, sets secure HTTP-only sessions, checks counselor permissions on the server, throttles public forms and sign-in attempts, and restricts browser links to safe URL schemes. Vercel response headers add a content security policy and clickjacking protection.

## Connect the production database and first admin

The Vercel deployment uses a Neon Postgres database in Singapore and a Node.js function at `/api/crm`. The function creates its tables automatically the first time it connects. First-admin setup needs a private `CRM_BOOTSTRAP_TOKEN`; remove that variable after the administrator is created. Keep the Neon database connection variable (`DATABASE_URL`) configured.

1. In Vercel, connect a Neon Postgres resource to this project and the **Production** environment. Use the free plan unless the account owner chooses a paid plan.
2. In **Project Settings → Environment Variables**, add `CRM_BOOTSTRAP_TOKEN` with a long, random value. Keep it out of Git and do not share it in the website source.
3. Redeploy so the new environment variable is available to the server function.
4. Open `/crm`. Enter the setup token once to create the first administrator. Choose a unique sign-in ID and a password of at least 12 characters. The token is required only for initial setup; remove it from Vercel after the first admin exists.
5. Sign in as the admin, add counselor accounts, and give each counselor only the sections they need.

The database and bootstrap token must be connected before accepting real student records. Existing records saved in browser storage are not uploaded automatically; export and import them from the authenticated CRM only if they are needed. GitHub Pages and the separate Express static server do not run this `/api` backend; use the Vercel deployment for shared CRM data.

React is installed from the official npm packages. Its upstream source repository is [facebook/react on GitHub](https://github.com/facebook/react).

## Static preview on GitHub Pages

1. Create a GitHub repository and push this project to its `main` or `master` branch.
2. In the repository, open **Settings → Pages** and set the publishing source to **GitHub Actions**.
3. Open the **Actions** tab and wait for **Deploy site to GitHub Pages** to finish. GitHub will show the published URL in the workflow run and under **Settings → Pages**.

The workflow builds the public website for either a repository URL (`https://<account>.github.io/<repository>/`) or an account site (`https://<account>.github.io/`). GitHub Pages is static hosting and does not run the CRM API. Use the Vercel deployment for `/crm`, campaign submissions, and any shared student records.

Do not enter real student records on a GitHub Pages copy of the site.
