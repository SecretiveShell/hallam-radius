# Hallam Radius

A React + TypeScript single-page app for exploring travel-time isochrones around **Sheffield Hallam University's Owen Building** (53.37923, −1.46561).

## Run locally

Use Node.js 22.13+ (or a current LTS) and pnpm 11.

```sh
pnpm install
pnpm dev
```

Open the local URL printed by Vite, normally http://localhost:5173.

```sh
pnpm build        # Typecheck and produce dist/
pnpm preview      # Serve the production build
pnpm lint         # ESLint; warnings fail
pnpm typecheck    # Strict TypeScript check
pnpm test         # Geographic, settings, and API contract tests
pnpm format       # Format source with Prettier
pnpm format:check
```

## Stack

- React 19, strict TypeScript, Vite 8; fully client-rendered SPA
- pnpm with a committed lockfile
- Tailwind CSS 4 via its Vite plugin, custom responsive styles
- ESLint 10, TypeScript ESLint, React Hooks and Fast Refresh rules
- Prettier, Vitest
- Leaflet / React Leaflet, MapLibre GL with OpenFreeMap Positron, Turf geometry utilities, Lucide icons

## Features

- Walking, cycling and driving isochrones with 5–30 minute controls, always starting at Owen Building.
- Coffee shops selected by default; a header Share button copies the map link.
- Three detailed street-network travel-time areas, map panning/zooming and campus recentering. Contour simplification and small-contour removal are disabled; Leaflet also retains the full geometry.
- Nearby coffee shops, places to eat, green spaces, culture and essentials, filtered together in the place list and map by category and individually routed travel times.
- Each place popup links to Google Maps directions from the device’s current location using the selected travel mode. The origin is omitted so Google Maps resolves the starting location. Google Maps handles navigation or route preview depending on the device and location.
- GeoJSON download and shareable URL settings (`?mode=bicycle&minutes=20`).
- Responsive mobile layout, keyboard controls, accessible modal and loading/error states.
- Debounced, abortable requests with a 15-second timeout and session caching. Destination travel times are batched below the public server’s 100-location limit and cached per travel mode.
- Real saved 10-minute walking contours for an immediate default view. A failed fresh request shows a retry action rather than fabricated contours.

## Map and routing data

The default Owen Building coordinates come from [OpenStreetMap way 104012726](https://www.openstreetmap.org/way/104012726). The basemap uses [OpenFreeMap Positron](https://openfreemap.org/quick_start/) through MapLibre GL, keeping the light theme without an API key or account. OpenFreeMap, OpenMapTiles and OpenStreetMap attribution stays visible. The vector basemap requires browser WebGL support. [Valhalla](https://valhalla.github.io/valhalla/api/isochrone/) calculates reachability along the street network. Estimates are not live navigation: traffic, weather, crossings, personal pace and conditions can change actual travel times. Place eligibility uses Valhalla’s time-distance matrix from Owen Building to each location. The exact returned seconds are compared with the selected limit before rounding up for display (for example, 601 seconds is excluded from a 10-minute search). Unreachable places are excluded. Labels use “≈” because routed travel times remain estimates; source and destination locations snap to the mapped street network, not necessarily the building entrance. Shaded boundaries interpolate between streets and can disagree with individual journeys near their edges. Walking explicitly uses 5.1 km/h for both contours and destination times; cycling and driving use the service’s default profiles.

`src/data/walking-10.json` is an actual Valhalla response fetched on **20 September 2026**, using walking contours at 3, 7 and 10 minutes, polygon output, `denoise: 0`, and `generalize: 0`. `src/data/walking-times.json` contains the corresponding saved walking times and distances to all 225 listed places. These defaults are explicitly described as saved estimates. Other contours and travel modes are fetched on demand; route times are independent of the selected limit and are reused when the slider changes. Failed route-time requests show a retry action; the app does not substitute contour bands or straight-line estimates. Food and coffee locations are an OpenStreetMap city-centre snapshot, not a live directory or an indication that a venue is open. Internet access is required for map tiles, fonts and new routing requests.

The prototype uses the public FOSSGIS Valhalla demo service with an identifying `X-Client-Id` header. Its availability and rate limits are outside this app's control. Before distributing a production application, follow the [demo service's fair-use guidance](https://github.com/valhalla/valhalla#demo-server), identify your application, and arrange a suitable endpoint or host your own Valhalla instance.

To set your own endpoint:

```sh
cp .env.example .env.local
```

Set `VITE_VALHALLA_URL` to your Valhalla server's base URL, then restart Vite (or rebuild). It must support browser CORS for `GET` and `POST`, plus the `Content-Type` and `X-Client-Id` request headers. `VITE_` values are public; never place secrets in them.

## Structure

```text
src/
  App.tsx                 Map, controls, accessible information modal
  Basemap.tsx             OpenFreeMap Positron and bundled MapLibre worker
  index.css               Responsive styles and Tailwind entry
  lib.ts                  Typed routing client and geographic calculations
  lib.test.ts             Behaviour and API-contract tests
  main.tsx                SPA entry point
  data/walking-10.json     Real saved initial isochrones
  data/walking-times.json  Saved individual walking route times
  data/walking-15.json     Saved API-test fixture
  data/food-places.json    OpenStreetMap coffee and food locations
```

## Deployment

`pnpm build` produces a static `dist/` directory suitable for static hosting. Serve `index.html` for client-side fallbacks if adding routes. This project requires no application backend or API key. It has not been published from this workspace.

An independent campus explorer; not affiliated with Sheffield Hallam University.

## Coffee and food data

`src/data/food-places.json` contains named cafés, restaurants, takeaways and food courts from [OpenStreetMap](https://www.openstreetmap.org/copyright), fetched on 20 September 2026 from the official map API for the city-centre bounds `-1.477,53.375,-1.460,53.384`. Each record includes a link to its source node or way. Way locations use the average of their mapped nodes. Categories follow the OSM amenity tag: cafés appear under Coffee shops; restaurants, takeaways and food courts appear under Places to eat. This is a saved local selection, so longer travel times do not provide complete city-wide coverage. Opening hours and business availability are not checked live.
