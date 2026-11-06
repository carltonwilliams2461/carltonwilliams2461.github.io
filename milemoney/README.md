# MileMoney

A dependency-free static website containing five working calculators for owner-operators and small-fleet truckers:

1. Cost-Per-Mile Calculator with a printable cost summary.
2. Load Profit Checker with a profit verdict badge.
3. Fuel Surcharge Calculator.
4. Break-Even Rate Finder.
5. IFTA Fuel-Tax Estimator with editable state rows (estimator only — not a filing tool).

## Run locally

Open `index.html` in a browser, or serve the folder with any static server:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Deploy free

This folder can be deployed as-is to GitHub Pages, Cloudflare Pages, Netlify, or another static host. There is no build step, database, account system, or monthly hosting requirement in the code.

A live preview of this build is hosted on GitHub Pages at `https://carltonwilliams2461.github.io/milemoney/`. That preview URL belongs to the seller's account and is not part of the sale; the buyer deploys the supplied source on their own host and domain.

After choosing a production domain:

1. Replace `carltonwilliams2461.github.io/milemoney` in `robots.txt` and `sitemap.xml` with the new domain/path.
2. Add the same domain to the page metadata if canonical/OG tags are added.
3. Submit the sitemap in Google Search Console.
4. Optionally connect privacy-respecting analytics; no analytics are installed by default.

## Privacy

All calculations run in the visitor's browser. The site does not collect or transmit form values.

## Transfer inventory

- `index.html` — complete page and SEO/schema markup.
- `styles.css` — responsive design and print stylesheet.
- `app.js` — calculator logic for all five tools.
- `assets/favicon.svg` — brand mark.
- `robots.txt` and `sitemap.xml` — launch files pointing at the preview deployment.
- `docs/` — deployment, buyer guide, SEO roadmap, and transfer checklist.

No domain, hosting account, analytics account, email list, revenue, traffic, customer data, or third-party subscription is included unless separately agreed in the sale.
