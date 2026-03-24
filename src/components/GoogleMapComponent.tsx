'use client'

import { useState, useCallback, useRef } from 'react'
import { GoogleMap, useLoadScript, InfoWindow } from '@react-google-maps/api'

export interface MapMarker {
  lat: number
  lng: number
  label: string
  count: number
  avgLtv: number
  totalLtv: number
  patients: { name: string; ltv: number }[]
}

interface Props {
  markers: MapMarker[]
  height?: string
}

const MAP_CENTER = { lat: 34.7, lng: 135.5 } // 近畿地方中心
const MAP_OPTIONS: google.maps.MapOptions = {
  disableDefaultUI: false,
  clickableIcons: false,
  mapTypeControl: false,
  fullscreenControl: true,
  streetViewControl: false,
  styles: [
    { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
    { featureType: 'transit', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  ],
}

function MarkerCircle({
  map,
  marker,
  maxCount,
  onClick,
}: {
  map: google.maps.Map
  marker: MapMarker
  maxCount: number
  onClick: (m: MapMarker) => void
}) {
  const ratio = maxCount > 0 ? marker.count / maxCount : 0
  const radius = 8000 + ratio * 22000  // 8km ~ 30km
  const opacity = 0.25 + ratio * 0.55

  const circleRef = useRef<google.maps.Circle | null>(null)
  const labelRef = useRef<google.maps.Marker | null>(null)

  // Draw circle
  if (!circleRef.current) {
    circleRef.current = new google.maps.Circle({
      map,
      center: { lat: marker.lat, lng: marker.lng },
      radius,
      fillColor: '#14252A',
      fillOpacity: opacity,
      strokeColor: '#14252A',
      strokeOpacity: 0.8,
      strokeWeight: 1.5,
      clickable: true,
    })
    circleRef.current.addListener('click', () => onClick(marker))
  }

  // Label marker
  if (!labelRef.current) {
    labelRef.current = new google.maps.Marker({
      map,
      position: { lat: marker.lat, lng: marker.lng },
      label: {
        text: `${marker.count}人`,
        color: '#ffffff',
        fontSize: '11px',
        fontWeight: 'bold',
      },
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 0,
      },
      clickable: true,
    })
    labelRef.current.addListener('click', () => onClick(marker))
  }

  return null
}

export default function GoogleMapComponent({ markers, height = '500px' }: Props) {
  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
    language: 'ja',
    region: 'JP',
  })

  const [selected, setSelected] = useState<MapMarker | null>(null)
  const [map, setMap] = useState<google.maps.Map | null>(null)
  const circlesRef = useRef<{ circle: google.maps.Circle; label: google.maps.Marker }[]>([])

  const maxCount = markers.length > 0 ? Math.max(...markers.map(m => m.count)) : 1

  const onLoad = useCallback((mapInstance: google.maps.Map) => {
    setMap(mapInstance)

    // Fit bounds to all markers
    if (markers.length > 0) {
      const bounds = new google.maps.LatLngBounds()
      markers.forEach(m => bounds.extend({ lat: m.lat, lng: m.lng }))
      mapInstance.fitBounds(bounds, { top: 60, right: 40, bottom: 40, left: 40 })
    }

    // Draw circles + labels
    circlesRef.current.forEach(({ circle, label }) => {
      circle.setMap(null)
      label.setMap(null)
    })
    circlesRef.current = []

    markers.forEach(marker => {
      const ratio = maxCount > 0 ? marker.count / maxCount : 0
      const radius = 5000 + ratio * 20000
      const opacity = 0.25 + ratio * 0.55

      const circle = new google.maps.Circle({
        map: mapInstance,
        center: { lat: marker.lat, lng: marker.lng },
        radius,
        fillColor: '#14252A',
        fillOpacity: opacity,
        strokeColor: '#14252A',
        strokeOpacity: 0.9,
        strokeWeight: 1.5,
        clickable: true,
      })
      circle.addListener('click', () => setSelected(marker))

      const label = new google.maps.Marker({
        map: mapInstance,
        position: { lat: marker.lat, lng: marker.lng },
        label: {
          text: `${marker.count}人`,
          color: '#ffffff',
          fontSize: '11px',
          fontWeight: 'bold',
        },
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: 0 },
        clickable: true,
      })
      label.addListener('click', () => setSelected(marker))

      circlesRef.current.push({ circle, label })
    })
  }, [markers, maxCount])

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="text-red-500 font-bold mb-1">Google Maps の読み込みに失敗しました</p>
        <p className="text-gray-400 text-xs">APIキーを確認してください</p>
      </div>
    )
  }

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-2 border-gray-300 border-t-[#14252A] rounded-full animate-spin" />
        <span className="ml-3 text-gray-500 text-sm">Google Maps 読み込み中...</span>
      </div>
    )
  }

  return (
    <div className="relative">
      <GoogleMap
        mapContainerStyle={{ width: '100%', height }}
        center={MAP_CENTER}
        zoom={6}
        options={MAP_OPTIONS}
        onLoad={onLoad}
      >
        {selected && (
          <InfoWindow
            position={{ lat: selected.lat, lng: selected.lng }}
            onCloseClick={() => setSelected(null)}
            options={{ pixelOffset: new google.maps.Size(0, -10) }}
          >
            <div style={{ minWidth: 180, fontFamily: 'sans-serif' }}>
              <p style={{ fontWeight: 'bold', fontSize: 14, marginBottom: 6, color: '#14252A' }}>
                📍 {selected.label}
              </p>
              <div style={{ fontSize: 12, color: '#555', lineHeight: 1.8 }}>
                <div>患者数: <strong style={{ color: '#1d4ed8' }}>{selected.count}人</strong></div>
                <div>総LTV: <strong>¥{selected.totalLtv.toLocaleString()}</strong></div>
                <div>平均LTV: <strong style={{ color: '#16a34a' }}>¥{selected.avgLtv.toLocaleString()}</strong></div>
              </div>
              {selected.patients.length > 0 && (
                <div style={{ marginTop: 8, borderTop: '1px solid #eee', paddingTop: 6 }}>
                  <p style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>LTV上位</p>
                  {selected.patients.slice(0, 4).map((p, i) => (
                    <div key={i} style={{ fontSize: 11, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span>{p.name}</span>
                      <span style={{ color: '#888' }}>¥{p.ltv.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </InfoWindow>
        )}
      </GoogleMap>

      {/* 凡例 */}
      <div className="absolute bottom-3 left-3 bg-white rounded-xl shadow-md px-3 py-2 text-xs z-10">
        <p className="font-bold text-gray-700 mb-1">凡例</p>
        <div className="flex items-center gap-1.5 mb-1">
          <div className="w-4 h-4 rounded-full bg-[#14252A] opacity-30" />
          <span className="text-gray-500">少ない</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded-full bg-[#14252A] opacity-80" />
          <span className="text-gray-500">多い</span>
        </div>
        <p className="text-gray-400 mt-1">円をクリックで詳細</p>
      </div>
    </div>
  )
}
