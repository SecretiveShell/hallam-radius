import { GeoJSON, Pane, Popup, Tooltip } from 'react-leaflet'
import { ArrowUpRight } from 'lucide-react'
import L from 'leaflet'
import { campus } from './campus'
import { googleMapsDirectionsUrl } from './lib'
import type { Mode } from './lib'

const footprints = campus.features.map((feature) => ({
  feature,
  center: L.geoJSON(feature).getBounds().getCenter(),
}))
const buildingStyle = {
  color: '#884567',
  weight: 1.5,
  opacity: 0.95,
  fillColor: '#ad668f',
  fillOpacity: 0.38,
}

export default function CampusBuildings({ mode }: { mode: Mode }) {
  return (
    <Pane name="campus-buildings" style={{ zIndex: 450 }}>
      {footprints.map(({ feature, center }) => (
        <GeoJSON
          key={feature.id}
          data={feature}
          style={buildingStyle}
          onEachFeature={(_, layer) => {
            if (layer instanceof L.Polygon) {
              layer.options.smoothFactor = 0
              layer.on({
                mouseover: () =>
                  layer.setStyle({ fillOpacity: 0.6, weight: 2 }),
                mouseout: () => layer.setStyle(buildingStyle),
              })
            }
          }}
        >
          <Tooltip
            pane="tooltipPane"
            permanent
            direction="center"
            opacity={1}
            className="campus-label"
          >
            {feature.properties.name}
          </Tooltip>
          {/* Override the surrounding Pane so popups sit above every feature. */}
          <Popup pane="popupPane">
            <strong>{feature.properties.name}</strong>
            <p>Sheffield Hallam University</p>
            <a
              className="navigate-button"
              href={googleMapsDirectionsUrl(
                { lat: center.lat, lon: center.lng },
                mode,
              )}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Navigate in Google Maps to ${feature.properties.name} (opens in a new tab)`}
            >
              Navigate in Google Maps{' '}
              <ArrowUpRight size={16} aria-hidden="true" />
            </a>
            <a
              href={feature.properties.source}
              target="_blank"
              rel="noreferrer"
            >
              View on OpenStreetMap
            </a>
          </Popup>
        </GeoJSON>
      ))}
    </Pane>
  )
}
