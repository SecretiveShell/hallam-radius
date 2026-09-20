import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson'
import booleanPointInPolygon from '@turf/boolean-point-in-polygon'
import savedWalking from './data/walking-10.json'
import savedWalkingTimes from './data/walking-times.json'
import foodPlaces from './data/food-places.json'

export const ORIGIN: [number, number] = [53.37923, -1.46561]
export type Mode = 'pedestrian' | 'bicycle' | 'auto'
export type Contours = FeatureCollection<
  Polygon | MultiPolygon,
  { contour: number }
>
export const modes = {
  pedestrian: 'Walking',
  bicycle: 'Cycling',
  auto: 'Driving',
} as const
export const colors = ['#28785a', '#6aab77', '#b1c77a']
export const defaultContours = savedWalking as Contours
export const savedDate = '20 September 2026'

export const placeCategories = [
  'All places',
  'Coffee shops',
  'Places to eat',
  'Green spaces',
  'Culture',
  'Essentials',
] as const
export type PlaceFilter = (typeof placeCategories)[number]
export function readPlaceFilters(search: string) {
  const params = new URLSearchParams(search)
  const category = params.get('category')
  return {
    category: placeCategories.includes(category as PlaceFilter)
      ? (category as PlaceFilter)
      : ('Coffee shops' as PlaceFilter),
    query: (params.get('q') ?? '').slice(0, 120),
  }
}
export type Place = {
  name: string
  category: Exclude<PlaceFilter, 'All places'>
  lat: number
  lon: number
  detail: string
  source?: string
}
const landmarks: Place[] = [
  {
    name: 'Winter Garden',
    category: 'Green spaces',
    lat: 53.38002,
    lon: -1.46792,
    detail: 'A little green in the heart of the city.',
  },
  {
    name: 'Sheffield station',
    category: 'Essentials',
    lat: 53.37824,
    lon: -1.46212,
    detail: 'Your connection to the city and beyond.',
  },
  {
    name: 'Millennium Gallery',
    category: 'Culture',
    lat: 53.37984,
    lon: -1.46707,
    detail: 'Art, craft and Sheffield’s steel heritage.',
  },
  {
    name: 'Peace Gardens',
    category: 'Green spaces',
    lat: 53.38021,
    lon: -1.46972,
    detail: 'Take a breather by the fountains.',
  },
  {
    name: 'Devonshire Green',
    category: 'Green spaces',
    lat: 53.37854,
    lon: -1.47772,
    detail: 'An open space beside the independent quarter.',
  },
  {
    name: 'The Moor Market',
    category: 'Essentials',
    lat: 53.37519,
    lon: -1.47445,
    detail: 'Independent stalls and something for lunch.',
  },
  {
    name: 'Kelham Island Museum',
    category: 'Culture',
    lat: 53.3897,
    lon: -1.4716,
    detail: 'Discover the story of the Steel City.',
  },
  {
    name: 'Weston Park',
    category: 'Green spaces',
    lat: 53.38291,
    lon: -1.4897,
    detail: 'Gardens, a museum and room to wander.',
  },
]
export const places: Place[] = [
  ...landmarks,
  ...foodPlaces.map((place): Place => ({
    name: place.name,
    category: place.amenity === 'cafe' ? 'Coffee shops' : 'Places to eat',
    lat: place.lat,
    lon: place.lon,
    detail: place.detail,
    source: place.source,
  })),
]

export const WALKING_SPEED_KMH = 5.1
export type TravelTimes = ReadonlyMap<string, number | null>
export function googleMapsDirectionsUrl(
  destination: Pick<Place, 'lat' | 'lon'>,
  mode: Mode,
): string {
  const travelModes = {
    pedestrian: 'walking',
    bicycle: 'bicycling',
    auto: 'driving',
  } as const
  const params = new URLSearchParams({
    api: '1',
    destination: `${destination.lat},${destination.lon}`,
    travelmode: travelModes[mode],
    dir_action: 'navigate',
  })
  // Omitting origin lets Google Maps use the device's current location.
  return `https://www.google.com/maps/dir/?${params.toString()}`
}

export function placeKey(place: Pick<Place, 'lat' | 'lon'>): string {
  return `${place.lat},${place.lon}`
}
export const defaultTravelTimes: TravelTimes = new Map(
  savedWalkingTimes.map((place) => [placeKey(place), place.seconds]),
)

export function nearbyPlaces(
  times: TravelTimes | null,
  minutes: number,
  category: PlaceFilter,
  query = '',
) {
  if (!times) return []
  const normalize = (value: string) =>
    value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
  const words = normalize(query).trim().split(/\s+/).filter(Boolean)
  return places
    .flatMap((place) => {
      if (category !== 'All places' && category !== place.category) return []
      const searchable = normalize(`${place.name} ${place.detail}`)
      if (!words.every((word) => searchable.includes(word))) return []
      const seconds = times.get(placeKey(place))
      if (
        typeof seconds !== 'number' ||
        !Number.isFinite(seconds) ||
        seconds < 0 ||
        (minutes !== 0 && seconds > minutes * 60)
      )
        return []
      return [{ place, seconds, time: Math.max(1, Math.ceil(seconds / 60)) }]
    })
    .sort(
      (a, b) =>
        a.seconds - b.seconds || a.place.name.localeCompare(b.place.name),
    )
}

function routingProfile(mode: Mode) {
  return {
    costing: mode,
    ...(mode === 'pedestrian'
      ? {
          costing_options: { pedestrian: { walking_speed: WALKING_SPEED_KMH } },
        }
      : {}),
  }
}
const endpoint = (
  import.meta.env.VITE_VALHALLA_URL || 'https://valhalla1.openstreetmap.de'
).replace(/\/$/, '')

// Validate source/target indices so missing or reordered results cannot be
// accidentally assigned to another business. null explicitly means no route.
export function parseTravelTimes(
  value: unknown,
  targets: readonly Place[],
): Map<string, number | null> {
  const invalid = () =>
    new Error(
      'The routing service returned incomplete travel times. Please try again.',
    )
  if (!value || typeof value !== 'object' || !('sources_to_targets' in value))
    throw invalid()
  const matrix = value.sources_to_targets
  if (
    !Array.isArray(matrix) ||
    matrix.length !== 1 ||
    !Array.isArray(matrix[0]) ||
    matrix[0].length !== targets.length
  )
    throw invalid()
  const results = new Map<string, number | null>()
  const seen = new Set<number>()
  for (const entry of matrix[0]) {
    if (!entry || typeof entry !== 'object') throw invalid()
    const {
      from_index: source,
      to_index: target,
      time,
    } = entry as Record<string, unknown>
    if (
      source !== 0 ||
      typeof target !== 'number' ||
      !Number.isInteger(target) ||
      target < 0 ||
      target >= targets.length ||
      seen.has(target)
    )
      throw invalid()
    if (
      time !== null &&
      (typeof time !== 'number' || !Number.isFinite(time) || time < 0)
    )
      throw invalid()
    seen.add(target)
    results.set(placeKey(targets[target]), time as number | null)
  }
  return results
}

function pauseBetweenBatches(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted()
    const cancel = () => {
      clearTimeout(timer)
      reject(signal.reason)
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', cancel)
      resolve()
    }, 1000)
    signal.addEventListener('abort', cancel, { once: true })
  })
}

export async function fetchTravelTimes(
  mode: Mode,
  signal: AbortSignal,
  targets: readonly Place[] = places,
): Promise<TravelTimes> {
  const results = new Map<string, number | null>()
  // The public server allows 100 locations including the origin.
  for (let start = 0; start < targets.length; start += 90) {
    if (start) await pauseBetweenBatches(signal)
    signal.throwIfAborted()
    const batch = targets.slice(start, start + 90)
    const response = await fetch(`${endpoint}/sources_to_targets`, {
      method: 'POST',
      signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Id': 'hallam-radius-local',
      },
      body: JSON.stringify({
        sources: [{ lat: ORIGIN[0], lon: ORIGIN[1] }],
        targets: batch.map(({ lat, lon }) => ({ lat, lon })),
        ...routingProfile(mode),
        units: 'kilometers',
        verbose: true,
      }),
    })
    if (!response.ok)
      throw new Error(
        response.status === 429
          ? 'The routing service is busy. Please try again in a moment.'
          : 'Couldn’t calculate individual travel times. Please try again.',
      )
    for (const [key, seconds] of parseTravelTimes(await response.json(), batch))
      results.set(key, seconds)
  }
  return results
}

export function getBands(minutes: number) {
  if (minutes === 0) return []
  return [
    ...new Set([
      Math.max(1, Math.round(minutes / 3)),
      Math.round((minutes * 2) / 3),
      minutes,
    ]),
  ]
}
export function readSettings(search: string): { mode: Mode; minutes: number } {
  const params = new URLSearchParams(search)
  const mode = params.get('mode')
  const rawMinutes = params.get('minutes')
  const minutes = rawMinutes?.trim() ? Number(rawMinutes) : NaN
  return {
    mode: mode === 'bicycle' || mode === 'auto' ? mode : 'pedestrian',
    minutes: [0, 5, 10, 15, 20, 25, 30].includes(minutes) ? minutes : 10,
  }
}
export function colorFor(contour: number, bands: number[]) {
  return colors[Math.max(0, bands.indexOf(contour))] ?? colors[2]
}
export function reachableBand(
  place: Place,
  data: Contours | null,
): number | null {
  if (!data) return null
  const matching = data.features.filter((feature) =>
    booleanPointInPolygon([place.lon, place.lat], feature),
  )
  return matching.length
    ? Math.min(...matching.map((f) => f.properties.contour))
    : null
}
function validRing(value: unknown): boolean {
  if (!Array.isArray(value) || value.length < 4) return false
  if (
    !value.every(
      (point) =>
        Array.isArray(point) &&
        point.length >= 2 &&
        Number.isFinite(point[0]) &&
        Number.isFinite(point[1]) &&
        Math.abs(point[0]) <= 180 &&
        Math.abs(point[1]) <= 90,
    )
  )
    return false
  const first = value[0] as number[]
  const last = value[value.length - 1] as number[]
  return first[0] === last[0] && first[1] === last[1]
}
function validPolygon(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0 && value.every(validRing)
}
export function isContours(value: unknown): value is Contours {
  if (typeof value !== 'object' || !value) return false
  const collection = value as FeatureCollection
  return (
    collection.type === 'FeatureCollection' &&
    Array.isArray(collection.features) &&
    collection.features.length > 0 &&
    collection.features.every((feature) => {
      if (
        feature?.type !== 'Feature' ||
        !feature.geometry ||
        typeof feature.properties?.contour !== 'number' ||
        !Number.isFinite(feature.properties.contour) ||
        feature.properties.contour <= 0
      )
        return false
      const { geometry } = feature
      return geometry.type === 'Polygon'
        ? validPolygon(geometry.coordinates)
        : geometry.type === 'MultiPolygon' &&
            Array.isArray(geometry.coordinates) &&
            geometry.coordinates.length > 0 &&
            geometry.coordinates.every(validPolygon)
    })
  )
}
export async function fetchContours(
  mode: Mode,
  minutes: number,
  signal: AbortSignal,
): Promise<Contours> {
  if (minutes <= 0)
    throw new RangeError('Travel-area requests require a positive time limit.')
  const params = {
    locations: [{ lat: ORIGIN[0], lon: ORIGIN[1] }],
    ...routingProfile(mode),
    contours: getBands(minutes).map((time) => ({ time })),
    polygons: true,
    denoise: 0,
    generalize: 0,
  }
  const response = await fetch(
    `${endpoint}/isochrone?json=${encodeURIComponent(JSON.stringify(params))}`,
    {
      signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
      headers: { 'X-Client-Id': 'hallam-radius-local' },
    },
  )
  if (!response.ok)
    throw new Error(
      response.status === 429
        ? 'The routing service is busy. Please try again in a moment.'
        : 'The routing service is unavailable. Please try again.',
    )
  const data: unknown = await response.json()
  if (
    !isContours(data) ||
    !getBands(minutes).every((time) =>
      data.features.some((feature) => feature.properties.contour === time),
    )
  )
    throw new Error(
      'The routing service returned an unexpected map. Please try again.',
    )
  return {
    ...data,
    features: [...data.features].sort(
      (a, b) => b.properties.contour - a.properties.contour,
    ),
  }
}
