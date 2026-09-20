import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ORIGIN,
  nearbyPlaces,
  defaultContours,
  defaultTravelTimes,
  fetchTravelTimes,
  parseTravelTimes,
  placeKey,
  WALKING_SPEED_KMH,
  fetchContours,
  getBands,
  isContours,
  places,
  reachableBand,
  readSettings,
  readPlaceFilters,
} from './lib'
import type { Contours, Mode } from './lib'
import walking15 from './data/walking-15.json'

const rectangle = (
  time: number,
  radius: number,
): Contours['features'][number] => ({
  type: 'Feature',
  properties: { contour: time },
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [-1.46792 - radius, 53.38002 - radius],
        [-1.46792 + radius, 53.38002 - radius],
        [-1.46792 + radius, 53.38002 + radius],
        [-1.46792 - radius, 53.38002 + radius],
        [-1.46792 - radius, 53.38002 - radius],
      ],
    ],
  },
})
afterEach(() => vi.unstubAllGlobals())

describe('place search', () => {
  it('restores shared filters and handles invalid categories safely', () => {
    expect(readPlaceFilters('?category=Places+to+eat&q=thai')).toEqual({
      category: 'Places to eat',
      query: 'thai',
    })
    expect(readPlaceFilters('?category=unknown')).toEqual({
      category: 'Coffee shops',
      query: '',
    })
    expect(readPlaceFilters(`?q=${'a'.repeat(150)}`).query).toHaveLength(120)
  })
  it('matches names and street details regardless of case, accents or whitespace', () => {
    const cafe = places.find((place) => place.name === 'Ambulo')!
    const times = new Map([[placeKey(cafe), 120]])
    for (const query of ['AMBULO', '  cafe   ARUNDEL  ', 'café']) {
      expect(
        nearbyPlaces(times, 10, 'Coffee shops', query).map(
          ({ place }) => place,
        ),
      ).toEqual([cafe])
    }
  })
  it('keeps category and exact travel-time limits in force while searching', () => {
    const cafe = places.find((place) => place.name === 'Ambulo')!
    expect(
      nearbyPlaces(
        new Map([[placeKey(cafe), 601]]),
        10,
        'Coffee shops',
        'Ambulo',
      ),
    ).toEqual([])
    expect(
      nearbyPlaces(
        new Map([[placeKey(cafe), 60]]),
        10,
        'Places to eat',
        'Ambulo',
      ),
    ).toEqual([])
    expect(nearbyPlaces(null, 10, 'Coffee shops', 'Ambulo')).toEqual([])
  })
  it('restores the complete ordered result set when search is cleared', () => {
    expect(nearbyPlaces(defaultTravelTimes, 10, 'Coffee shops', '   ')).toEqual(
      nearbyPlaces(defaultTravelTimes, 10, 'Coffee shops'),
    )
    expect(
      nearbyPlaces(defaultTravelTimes, 10, 'Coffee shops', 'no-such-place-xyz'),
    ).toEqual([])
  })
})

describe('shareable map settings', () => {
  it('supports overlay-off links without changing the default for missing or blank times', () => {
    expect(readSettings('?minutes=0')).toEqual({
      mode: 'pedestrian',
      minutes: 0,
    })
    expect(readSettings('?minutes=')).toEqual({
      mode: 'pedestrian',
      minutes: 10,
    })
    expect(readSettings('?minutes=+')).toEqual({
      mode: 'pedestrian',
      minutes: 10,
    })
    expect(getBands(0)).toEqual([])
  })
  it('defaults safely for absent or unsupported settings', () => {
    expect(readSettings('')).toEqual({ mode: 'pedestrian', minutes: 10 })
    expect(readSettings('?mode=helicopter&minutes=-10')).toEqual({
      mode: 'pedestrian',
      minutes: 10,
    })
    expect(readSettings('?mode=auto&minutes=Infinity')).toEqual({
      mode: 'auto',
      minutes: 10,
    })
  })
  it('restores valid cycling and driving links', () => {
    expect(readSettings('?mode=bicycle&minutes=30')).toEqual({
      mode: 'bicycle',
      minutes: 30,
    })
    expect(readSettings('?mode=auto&minutes=5')).toEqual({
      mode: 'auto',
      minutes: 5,
    })
  })
  it.each([5, 10, 15, 20, 25, 30])(
    'creates distinct ordered bands ending at %i minutes',
    (time) => {
      const bands = getBands(time)
      expect(bands.length).toBe(3)
      expect(new Set(bands).size).toBe(3)
      expect(bands[0]).toBeGreaterThan(0)
      expect(bands[2]).toBe(time)
      expect([...bands].sort((a, b) => a - b)).toEqual(bands)
    },
  )
})

describe('geographic results', () => {
  it('ships actual, valid default polygons and a reachable Winter Garden', () => {
    expect(isContours(defaultContours)).toBe(true)
    expect(
      defaultContours.features
        .map((f) => f.properties.contour)
        .sort((a, b) => a - b),
    ).toEqual([3, 7, 10])
    expect(reachableBand(places[0], defaultContours)).toBe(7)
    expect(reachableBand(places[7], defaultContours)).toBeNull()
  })
  it('uses the shortest matching band regardless of feature order', () => {
    const data: Contours = {
      type: 'FeatureCollection',
      features: [rectangle(15, 0.02), rectangle(5, 0.005), rectangle(10, 0.01)],
    }
    expect(reachableBand(places[0], data)).toBe(5)
  })
  it('shows no places while travel-time data is unavailable', () => {
    expect(nearbyPlaces(null, 10, 'Coffee shops')).toEqual([])
    expect(reachableBand(places[0], null)).toBeNull()
  })
  it.each(['Coffee shops', 'Places to eat'] as const)(
    'filters reachable %s consistently for the list and map',
    (category) => {
      const matches = nearbyPlaces(defaultTravelTimes, 10, category)
      expect(matches.length).toBeGreaterThan(0)
      expect(
        matches.every(
          ({ place, time }) => place.category === category && time <= 10,
        ),
      ).toBe(true)
      expect(matches.map(({ time }) => time)).toEqual(
        matches.map(({ time }) => time).sort((a, b) => a - b),
      )
      expect(nearbyPlaces(defaultTravelTimes, 10, 'All places')).toEqual(
        expect.arrayContaining(matches),
      )
    },
  )
  it.each([
    null,
    {},
    { type: 'FeatureCollection', features: [] },
    { type: 'FeatureCollection', features: [null] },
    {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { contour: 15 },
          geometry: { type: 'Polygon', coordinates: [] },
        },
      ],
    },
  ])('rejects malformed routing data: %j', (data) => {
    expect(isContours(data)).toBe(false)
  })
})

describe('routing integration', () => {
  it('never sends an overlay-off request to the routing service', async () => {
    const request = vi.fn()
    vi.stubGlobal('fetch', request)
    await expect(
      fetchContours('pedestrian', 0, new AbortController().signal),
    ).rejects.toThrow('positive time limit')
    expect(request).not.toHaveBeenCalled()
  })
  it.each<Mode>(['pedestrian', 'bicycle', 'auto'])(
    'requests %s isochrones from the correct campus origin',
    async (mode) => {
      const request = vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify(walking15), { status: 200 }),
        )
      vi.stubGlobal('fetch', request)
      const data = await fetchContours(mode, 15, new AbortController().signal)
      const url = new URL(request.mock.calls[0][0] as string)
      const params = JSON.parse(url.searchParams.get('json')!)
      expect(params.locations).toEqual([{ lat: ORIGIN[0], lon: ORIGIN[1] }])
      expect(params.costing).toBe(mode)
      expect(params.contours).toEqual([{ time: 5 }, { time: 10 }, { time: 15 }])
      expect(params.polygons).toBe(true)
      expect(params.generalize).toBe(0)
      expect(params.denoise).toBe(0)
      if (mode === 'pedestrian')
        expect(params.costing_options.pedestrian.walking_speed).toBe(
          WALKING_SPEED_KMH,
        )
      expect(data).toEqual(walking15)
    },
  )
  it('reports rate limits without inventing replacement contours', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('', { status: 429 })),
    )
    await expect(
      fetchContours('pedestrian', 15, new AbortController().signal),
    ).rejects.toThrow('busy')
  })
  it('rejects polygons with the wrong requested time bands', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify(walking15), { status: 200 }),
        ),
    )
    await expect(
      fetchContours('pedestrian', 30, new AbortController().signal),
    ).rejects.toThrow('unexpected map')
  })
})

describe('individual routed travel times', () => {
  const targetPlaces = places.slice(0, 3)
  const matrix = (times: (number | null)[]) => ({
    sources_to_targets: [
      times.map((time, to_index) => ({ from_index: 0, to_index, time })),
    ],
  })

  it('removes the time cap at zero while retaining search, category and valid-route filtering', () => {
    const cafe = places.find((place) => place.name === 'Ambulo')!
    const times = new Map([
      [placeKey(cafe), 2400],
      [placeKey(places[0]), null],
      [placeKey(places[1]), Infinity],
      [placeKey(places[2]), -1],
    ])
    expect(
      nearbyPlaces(times, 0, 'Coffee shops', 'ambulo').map(
        ({ place, time }) => [place.name, time],
      ),
    ).toEqual([['Ambulo', 40]])
    expect(nearbyPlaces(times, 30, 'Coffee shops', 'ambulo')).toEqual([])
    expect(nearbyPlaces(times, 0, 'Places to eat', 'ambulo')).toEqual([])
    expect(
      nearbyPlaces(times, 0, 'All places').map(({ place }) => place),
    ).toEqual([cafe])
  })

  it('has a saved route result for every listed location', () => {
    expect(
      places.every((place) => defaultTravelTimes.has(placeKey(place))),
    ).toBe(true)
  })
  it('compares seconds before rounding, excluding even slightly over-limit journeys', () => {
    const times = new Map([
      [placeKey(places[0]), 600],
      [placeKey(places[1]), 600.1],
      [placeKey(places[2]), null],
      [placeKey(places[3]), -1],
      [placeKey(places[4]), Infinity],
    ])
    const results = nearbyPlaces(times, 10, 'All places')
    expect(results.map(({ place }) => place)).toEqual([places[0]])
    expect(results[0].time).toBe(10)
  })
  it('orders by routed seconds even when rounded labels match', () => {
    const times = new Map([
      [placeKey(places[0]), 119],
      [placeKey(places[1]), 61],
    ])
    const results = nearbyPlaces(times, 10, 'All places')
    expect(results.map(({ place }) => place)).toEqual([places[1], places[0]])
    expect(results.map(({ time }) => time)).toEqual([2, 2])
  })
  it('does not include a venue simply because it is inside an isochrone', () => {
    expect(reachableBand(places[0], defaultContours)).not.toBeNull()
    expect(
      nearbyPlaces(new Map([[placeKey(places[0]), 601]]), 10, 'All places'),
    ).toEqual([])
  })
  it('uses explicit destination indices, preserving unreachable results', () => {
    const value = matrix([123, null, 321])
    value.sources_to_targets[0].reverse()
    const result = parseTravelTimes(value, targetPlaces)
    expect(result.get(placeKey(targetPlaces[0]))).toBe(123)
    expect(result.get(placeKey(targetPlaces[1]))).toBeNull()
    expect(result.get(placeKey(targetPlaces[2]))).toBe(321)
  })
  it.each([
    {},
    { sources_to_targets: [[]] },
    {
      sources_to_targets: [
        [
          { from_index: 0, to_index: 0, time: 12 },
          { from_index: 0, to_index: 0, time: 20 },
          { from_index: 0, to_index: 2, time: 30 },
        ],
      ],
    },
    {
      sources_to_targets: [
        [
          { from_index: 0, to_index: 0, time: -1 },
          { from_index: 0, to_index: 1, time: 20 },
          { from_index: 0, to_index: 2, time: 30 },
        ],
      ],
    },
  ])('rejects missing, duplicate or invalid route results', (value) => {
    expect(() => parseTravelTimes(value, targetPlaces)).toThrow('incomplete')
  })
  it.each<Mode>(['pedestrian', 'bicycle', 'auto'])(
    'requests %s route times using the same origin and profile as the area',
    async (mode) => {
      const request = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(matrix([123, null, 321])), {
          status: 200,
        }),
      )
      vi.stubGlobal('fetch', request)
      const result = await fetchTravelTimes(
        mode,
        new AbortController().signal,
        targetPlaces,
      )
      const [url, options] = request.mock.calls[0]
      const body = JSON.parse(options.body)
      expect(url).toMatch(/\/sources_to_targets$/)
      expect(options.method).toBe('POST')
      expect(body.sources).toEqual([{ lat: ORIGIN[0], lon: ORIGIN[1] }])
      expect(body.targets).toEqual(
        targetPlaces.map(({ lat, lon }) => ({ lat, lon })),
      )
      expect(body.costing).toBe(mode)
      if (mode === 'pedestrian')
        expect(body.costing_options.pedestrian.walking_speed).toBe(
          WALKING_SPEED_KMH,
        )
      expect(result.get(placeKey(targetPlaces[0]))).toBe(123)
    },
  )
  it('batches below the server location limit and combines all results', async () => {
    const request = vi.fn().mockImplementation((_url, options) => {
      const body = JSON.parse(options.body)
      expect(body.targets.length + body.sources.length).toBeLessThanOrEqual(100)
      return Promise.resolve(
        new Response(JSON.stringify(matrix(body.targets.map(() => 123))), {
          status: 200,
        }),
      )
    })
    vi.stubGlobal('fetch', request)
    const targets = places.slice(0, 91)
    const result = await fetchTravelTimes(
      'bicycle',
      new AbortController().signal,
      targets,
    )
    expect(request).toHaveBeenCalledTimes(2)
    expect(targets.every((place) => result.get(placeKey(place)) === 123)).toBe(
      true,
    )
  })
  it('propagates a cancelled request without querying another mode', async () => {
    const request = vi.fn()
    vi.stubGlobal('fetch', request)
    const controller = new AbortController()
    controller.abort()
    await expect(
      fetchTravelTimes('auto', controller.signal, targetPlaces),
    ).rejects.toThrow()
    expect(request).not.toHaveBeenCalled()
  })
  it('does not replace a failed route request with straight-line or band times', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('', { status: 503 })),
    )
    await expect(
      fetchTravelTimes('auto', new AbortController().signal, targetPlaces),
    ).rejects.toThrow('individual travel times')
  })
})
