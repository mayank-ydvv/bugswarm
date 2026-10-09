# BugSwarm buggy sample app

A tiny app with **deliberate** bugs, one per BugSwarm tester. Push it to your own GitHub repo
and point a BugSwarm project at it (see the main README).

| Tester     | Planted bug                                                       | Where                    |
|------------|-------------------------------------------------------------------|--------------------------|
| eslint     | unused variable, undefined global                                 | `src/cart.js`            |
| tsc        | string passed where a number is expected                          | `src/price.ts`           |
| semgrep    | `eval` on user input, `innerHTML` with a query param (XSS)        | `server.js`, `public/app.js` |
| gitleaks   | fake hard-coded GitHub token (not a real credential)              | `src/config.js`          |
| osv        | `lodash@4.17.15` (prototype pollution CVEs)                       | `package.json`           |
| playwright | console error on load; "Apply coupon" button throws; 404 link     | `public/`                |
| playwright | horizontal overflow on phones (fixed-width banner)                | `public/style.css`       |
| axe        | image without alt, button without accessible name, low contrast   | `public/index.html`      |

Run it locally: `npm run dev` then open http://localhost:3000.
