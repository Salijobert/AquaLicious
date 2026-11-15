import React, { useEffect, useRef } from 'react';
import { MapPin, ExternalLink } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Modal } from './Modal.js';
import { MAP_CONFIG, ANGELES_CITY_POLYGON_LAT_LNG } from '../config/deliveryMap.js';
import { createDeliveryPinIcon } from '../utils/leafletIcons.js';

interface AdminOrderMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderNumber: string;
  lat: number;
  lng: number;
  addressText?: string;
}

export const AdminOrderMapModal: React.FC<AdminOrderMapModalProps> = ({
  isOpen,
  onClose,
  orderNumber,
  lat,
  lng,
  addressText
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!isOpen || !mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [lat, lng],
        zoom: 15,
        maxZoom: MAP_CONFIG.maxZoom
      });

      L.tileLayer(MAP_CONFIG.tileUrl, {
        attribution: MAP_CONFIG.tileAttribution,
        maxZoom: MAP_CONFIG.maxZoom
      }).addTo(map);

      // Angeles City Perimeter Polygon
      L.polygon(ANGELES_CITY_POLYGON_LAT_LNG, {
        color: '#1565c0',
        weight: 2,
        fillColor: '#1e88e5',
        fillOpacity: 0.08,
        dashArray: '4, 6'
      }).addTo(map);

      // Pinned location
      L.marker([lat, lng], {
        icon: createDeliveryPinIcon()
      }).addTo(map);

      mapInstanceRef.current = map;

      setTimeout(() => {
        map.invalidateSize();
      }, 250);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [isOpen, lat, lng]);

  const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      title={`Delivery Location - Order #${orderNumber}`}
      subtitle="Station delivery pin within Angeles City"
      icon={<MapPin className="w-5 h-5 text-[#1565c0]" />}
      closeAriaLabel="Close delivery map view"
      footer={
        <div className="flex items-center justify-between w-full">
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-outline btn-sm gap-1.5 text-xs font-bold"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Open in Google Maps
          </a>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-primary btn-sm px-5 text-xs font-bold text-white rounded-xl"
          >
            Close
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="relative w-full h-[320px] rounded-xl overflow-hidden border border-gray-200">
          <div ref={mapContainerRef} className="w-full h-full" />
        </div>
        {addressText && (
          <div className="p-3 bg-slate-50 border border-gray-200 rounded-xl text-xs text-slate-800">
            <strong className="block text-gray-500 text-[10px] uppercase font-bold mb-0.5">Delivery Address:</strong>
            {addressText}
          </div>
        )}
      </div>
    </Modal>
  );
};

export default AdminOrderMapModal;
