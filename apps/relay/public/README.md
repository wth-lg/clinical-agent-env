# public/

The relay deployment's static output directory. It is empty on purpose, and this file is never
published.

Without a `public/` directory, Vercel's zero-config build serves every uploaded file outside `api/`
as a static route, so `src/*.ts` would be served. With one, only `public/` is static. Vercel's
static builder never publishes a file named `README.md`, so the deployment serves no static file
and has no route but the function (`../README.md`, "Static files").
