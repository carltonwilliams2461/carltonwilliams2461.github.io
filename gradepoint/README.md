# GradePoint

A dependency-free static website containing four working calculators for teachers, students, tutors, and homeschool parents:

1. GPA Calculator with editable course rows, unweighted GPA, and weighted GPA (Honors +0.5, AP +1.0).
2. Grade Needed on the Final calculator with already-secured and not-possible flags.
3. Gradebook % → Letter Converter with an editable grading scale, points conversion, and batch conversion.
4. Class Average & Curve Visualizer with mean, median, letter distribution, and flat, linear, and square-root curve previews.

## Run locally

Open `index.html` in a browser, or serve the folder with any static server:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Deploy free

This folder can be deployed as-is to GitHub Pages, Cloudflare Pages, Netlify, or another static host. There is no build step, database, account system, or monthly hosting requirement in the code.

After choosing a production domain:

1. Replace `YOUR-DOMAIN.example` in `robots.txt` and `sitemap.xml`.
2. Add the same domain to the page metadata if canonical/OG tags are added.
3. Submit the sitemap in Google Search Console.
4. Optionally connect privacy-respecting analytics; no analytics are installed by default.

## Privacy

All calculations run in the visitor's browser. The site does not collect or transmit form values.

## Transfer inventory

- `index.html` — complete page and SEO/schema markup.
- `styles.css` — responsive design and print stylesheet.
- `app.js` — calculator logic for all four tools, dynamic rows, copy/print summary.
- `assets/favicon.svg` — brand mark.
- `assets/social-preview.svg` — social sharing artwork.
- `robots.txt` and `sitemap.xml` — launch placeholders.
- `docs/` — deployment, buyer guide, SEO roadmap, and transfer checklist.

No domain, hosting account, analytics account, email list, revenue, traffic, customer data, or third-party subscription is included unless separately agreed in the sale.
