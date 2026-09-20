import { useEffect } from 'react'
import { useMap } from 'react-leaflet'
import { maplibreGL } from '@maplibre/maplibre-gl-leaflet'
import { setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'

// Vite must bundle the worker and its imports together for production.
setWorkerUrl(workerUrl)

export default function Basemap({
  onError,
}: {
  onError: (failed: boolean) => void
}) {
  const map = useMap()

  useEffect(() => {
    const layer = maplibreGL({
      style: 'https://tiles.openfreemap.org/styles/positron',
      attributionControl: {
        customAttribution:
          '<a href="https://openfreemap.org/">OpenFreeMap</a> © <a href="https://openmaptiles.org/">OpenMapTiles</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      },
    })
    try {
      layer.addTo(map)
    } catch {
      onError(true)
      return
    }
    const basemap = layer.getMaplibreMap()
    const handleError = () => onError(true)
    const handleLoad = () => onError(false)
    basemap.on('error', handleError)
    basemap.on('load', handleLoad)
    return () => {
      basemap.off('error', handleError)
      basemap.off('load', handleLoad)
      map.removeLayer(layer)
    }
  }, [map, onError])

  return null
}
