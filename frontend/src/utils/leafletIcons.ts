import L from 'leaflet';

export const DELIVERY_PIN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" width="32" height="42">
  <defs>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000000" flood-opacity="0.35"/>
    </filter>
  </defs>
  <path filter="url(#shadow)" fill="#0b3d91" stroke="#ffffff" stroke-width="14" d="M172.268 501.67C26.97 291.031 0 269.413 0 192 0 85.961 85.961 0 192 0s192 85.961 192 192c0 77.413-26.97 99.031-172.268 309.67-9.535 13.774-29.93 13.773-39.464 0z"/>
  <circle cx="192" cy="192" r="70" fill="#ffffff"/>
  <circle cx="192" cy="192" r="45" fill="#1565c0"/>
</svg>`;

export function createDeliveryPinIcon(): L.DivIcon {
  return L.divIcon({
    className: 'aq-delivery-pin-icon',
    html: `<div style="display:flex;align-items:center;justify-content:center;cursor:grab;">${DELIVERY_PIN_SVG}</div>`,
    iconSize: [32, 42],
    iconAnchor: [16, 42],
    popupAnchor: [0, -42]
  });
}
