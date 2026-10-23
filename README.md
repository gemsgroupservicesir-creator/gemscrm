# Krishna Foundation site

An editable React recreation of Krishna Foundation's website at [krishna.edu.np](https://krishna.edu.np/) with a connected local lead-management dashboard. The responsive site keeps its images in `public/images` so the preview does not rely on the original site being available. It includes the home page, About, Contact, Universities, Scholarships, student guides, six university profiles, and seven article routes. The live site timed out during this update, so the university and article pages use the content currently indexed for the original site and the page archive has not been exhaustively reproduced.

## Run it locally

```sh
npm install --cache ../../work/npm-cache
npm run dev
```

Open the local address printed by Vite. Public pages no longer show an Edit page control or a CRM dashboard link. In local development, open `/crm` to manage the browser-local CRM and use its **Website editor** to change copy across the home page, contact pages, university profiles, scholarships, and guides. Save a page section to show the updated copy in the site running in this browser. Use **Restore this page** in the editor to return that section to its starting copy.

The `/crm` dashboard supports searching, filtering, changing stages, updating notes, adding leads, and exporting visible leads to CSV. In **Website editor**, manage the home page banners, university cards, and testimonials; add or remove entries and upload resized images directly in the browser. The public website does not show a CRM link; open `/crm` directly to reach the dashboard. The login and data are stored only in each browser and do not provide server-side security.

The **Website editor → University profiles** section lets you add, edit, and remove university profiles. Each profile has its own URL name, introduction, image, and study options; the Universities directory links to the saved profiles. Changes are stored in this browser.

The **Landing pages** section builds campaign pages with configurable copy, two color styles, and optional phone, course, and student-image fields. Forms always collect a name and email address. Uploaded images are resized before saving; leads show the image and selected course in the CRM. Publish a page to create a `/landing/<page-link>/` route. Draft previews do not save submissions.

Counselors have an **Attendance** section that records sign-in and sign-out times, totals each local calendar day, and tracks progress toward an 8-hour target. Admins can view all three counselors; each counselor sees only their own attendance. Like the CRM itself, attendance is currently stored in this browser.

Leads, landing pages, and website copy stay in this browser's local storage. This local login does not secure a live, shared CRM; collecting leads from public visitors or sharing campaign pages across devices requires a hosted backend and authenticated CRM endpoint.

React is installed from the official npm packages. Its upstream source repository is [facebook/react on GitHub](https://github.com/facebook/react).

## Deploy with GitHub Pages

1. Create a GitHub repository and push this project to its `main` or `master` branch.
2. In the repository, open **Settings → Pages** and set the publishing source to **GitHub Actions**.
3. Open the **Actions** tab and wait for **Deploy site to GitHub Pages** to finish. GitHub will show the published URL in the workflow run and under **Settings → Pages**.

The workflow builds the site for either a repository URL (`https://<account>.github.io/<repository>/`) or an account site (`https://<account>.github.io/`). It also publishes a fallback page so site routes continue to load when opened directly. The GitHub Pages build includes the `/crm` route but does not display a CRM link or public edit controls in the website navigation. Open `/crm` directly to reach the dashboard.

**Before using it for real enquiries:** GitHub Pages hosts static files only. This app currently keeps leads, CRM accounts, campaign pages, and website edits in each visitor's browser storage. A public visitor's form submission will not appear in your CRM, and the browser-local CRM login is not a security boundary. Connect a hosted database and server-side login before using the CRM for sensitive shared data.
