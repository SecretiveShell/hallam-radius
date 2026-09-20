import type { FeatureCollection, Polygon } from 'geojson'
import buildings from './data/campus-buildings.json'

export const campus = buildings as FeatureCollection<
  Polygon,
  { name: string; source: string }
>

// Keep the default view on the continuous City Campus cluster. The three
// separate northern sites remain highlighted when panning or zooming out.
const northernSites = new Set(['86627247', '554315835', '103921348'])
const coordinates = campus.features
  .filter((feature) => !northernSites.has(String(feature.id)))
  .flatMap((feature) => feature.geometry.coordinates[0])

export const mainCampusBounds: [[number, number], [number, number]] = [
  [
    Math.min(...coordinates.map((point) => point[1])),
    Math.min(...coordinates.map((point) => point[0])),
  ],
  [
    Math.max(...coordinates.map((point) => point[1])),
    Math.max(...coordinates.map((point) => point[0])),
  ],
]
