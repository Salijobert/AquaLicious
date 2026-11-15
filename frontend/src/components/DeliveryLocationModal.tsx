import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Navigation, AlertTriangle, CheckCircle2, Loader2, Info } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Modal } from './Modal.js';
import {
  MAP_CONFIG,
  ANGELES_CITY_POLYGON_LAT_LNG,
  isDeliveryInServiceArea
} from '../config/deliveryMap.js';
import { createDeliveryPinIcon } from '../utils/leafletIcons.js';

export interface PinnedDeliveryLocation {
  lat: number;
  lng: number;
  street: string;
  barangay: string;
  landmark: string;
  contact?: string;
}

interface DeliveryLocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (location: PinnedDeliveryLocation) => void;
  initialLocation?: Partial<PinnedDeliveryLocation> | null;
}

export const DeliveryLocationModal: React.FC<DeliveryLocationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  initialLocation
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  const defaultLat = initialLocation?.lat || MAP_CONFIG.center[0];
  const defaultLng = initialLocation?.lng || MAP_CONFIG.center[1];

  const [currentPin, setCurrentPin] = useState<{ lat: number; lng: number }>({
    lat: defaultLat,
    lng: defaultLng
  });
  const [isInside, setIsInside] = useState<boolean>(() => isDeliveryInServiceArea(defaultLat, defaultLng));

  // Form fields
  const [street, setStreet] = useState(initialLocation?.street || '');
  const [barangay, setBarangay] = useState(initialLocation?.barangay || '');
  const [landmark, setLandmark] = useState(initialLocation?.landmark || '');
  const [contact, setContact] = useState(initialLocation?.contact || '');
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  // Reverse geocode single point (debounced/on-demand once per pin)
  const reverseGeocode = async (lat: number, lng: number) => {
    setIsGeocoding(true);
    setGeoError(null);
    try {
      const url = MAP_CONFIG.reverseGeocoderUrl
        .replace('{lat}', String(lat))
        .replace('{lon}', String(lng));

      const res = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'X-Application': MAP_CONFIG.appName
        }
      });

      if (res.ok) {
        const data = await res.json();
        const addr = data.address || {};
        const road = addr.road || addr.pedestrian || addr.suburb || '';
        const bgy = addr.quarter || addr.suburb || addr.neighbourhood || addr.village || '';

        if (road && !street) setStreet(road);
        if (bgy && !barangay) setBarangay(bgy);
      }
    } catch (err: any) {
      // Graceful fallback: user can enter street & barangay manually without blocking checkout
      console.warn('[Map Geocoder] Reverse geocoding notice:', err?.message || err);
      setGeoError('Auto-address lookup unavailable. Please enter your street and barangay manually below.');
    } finally {
      setIsGeocoding(false);
    }
  };

  // Initialize and tear down Leaflet Map
  useEffect(() => {
    if (!isOpen || !mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [currentPin.lat, currentPin.lng],
        zoom: MAP_CONFIG.defaultZoom,
        maxZoom: MAP_CONFIG.maxZoom,
        zoomControl: true
      });

      L.tileLayer(MAP_CONFIG.tileUrl, {
        attribution: MAP_CONFIG.tileAttribution,
        maxZoom: MAP_CONFIG.maxZoom
      }).addTo(map);

      // Angeles City Service Area Perimeter Polygon
      L.polygon(ANGELES_CITY_POLYGON_LAT_LNG, {
        color: '#1565c0',
        weight: 2,
        fillColor: '#1e88e5',
        fillOpacity: 0.12,
        dashArray: '4, 6'
      }).addTo(map);

      // Draggable Delivery Pin Marker
      const pinIcon = createDeliveryPinIcon();
      const marker = L.marker([currentPin.lat, currentPin.lng], {
        icon: pinIcon,
        draggable: true,
        autoPan: true
      }).addTo(map);

      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        const lat = Number(pos.lat.toFixed(6));
        const lng = Number(pos.lng.toFixed(6));
        const valid = isDeliveryInServiceArea(lat, lng);
        setCurrentPin({ lat, lng });
        setIsInside(valid);
        if (valid) {
          reverseGeocode(lat, lng);
        }
      });

      map.on('click', (e: L.LeafletMouseEvent) => {
        const lat = Number(e.latlng.lat.toFixed(6));
        const lng = Number(e.latlng.lng.toFixed(6));
        marker.setLatLng([lat, lng]);
        const valid = isDeliveryInServiceArea(lat, lng);
        setCurrentPin({ lat, lng });
        setIsInside(valid);
        if (valid) {
          reverseGeocode(lat, lng);
        }
      });

      mapInstanceRef.current = map;
      markerRef.current = marker;

      // Invalidate map size after modal transitions into DOM
      setTimeout(() => {
        map.invalidateSize();
      }, 250);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markerRef.current = null;
      }
    };
  }, [isOpen]);

  const handleConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isInside) return;
    if (!street.trim() || !barangay.trim() || !landmark.trim()) return;

    onConfirm({
      lat: currentPin.lat,
      lng: currentPin.lng,
      street: street.trim(),
      barangay: barangay.trim(),
      landmark: landmark.trim(),
      contact: contact.trim() || undefined
    });
    onClose();
  };

  const isFormValid = isInside && street.trim().length > 0 && barangay.trim().length > 0 && landmark.trim().length > 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="2xl"
      title="Pin Delivery Location"
      subtitle="Deliveries are restricted exclusively to Angeles City, Pampanga"
      icon={<MapPin className="w-5 h-5 text-[#1565c0]" />}
      closeAriaLabel="Close map location picker"
      bodyClassName="p-0 sm:p-2"
    >
      <div className="flex flex-col space-y-3">
        {/* Map Area */}
        <div className="relative w-full h-[280px] sm:h-[340px] rounded-xl overflow-hidden border border-gray-200 bg-slate-100">
          <div ref={mapContainerRef} className="w-full h-full z-0" />
          
          {/* Service Area Status Floating Pill */}
          <div className="absolute top-2.5 left-2.5 right-2.5 z-[400] flex justify-center pointer-events-none">
            {isInside ? (
              <div className="bg-emerald-600/95 backdrop-blur-sm text-white px-3 py-1.5 rounded-full text-xs font-bold shadow-md flex items-center gap-1.5 pointer-events-auto">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Inside Angeles City Service Area</span>
              </div>
            ) : (
              <div className="bg-red-600/95 backdrop-blur-sm text-white px-3 py-1.5 rounded-full text-xs font-bold shadow-md flex items-center gap-1.5 pointer-events-auto">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Sorry, we only deliver within Angeles City, Pampanga.</span>
              </div>
            )}
          </div>

          {/* Coordinates readout */}
          <div className="absolute bottom-2 left-2 z-[400] bg-white/90 backdrop-blur-sm px-2.5 py-1 rounded-md text-[10px] font-mono text-slate-700 shadow-xs border border-gray-200 pointer-events-none">
            Lat: {currentPin.lat}, Lng: {currentPin.lng}
          </div>
        </div>

        {/* Address Details Form */}
        <form onSubmit={handleConfirm} className="space-y-3 px-3 py-2 bg-slate-50 rounded-xl border border-gray-200">
          <div className="flex items-center justify-between text-xs font-bold text-slate-800">
            <span>Address Details</span>
            {isGeocoding && (
              <span className="text-[11px] text-blue-700 flex items-center gap-1 font-normal">
                <Loader2 className="w-3 h-3 animate-spin" /> Looking up street details...
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                House / Building & Street *
              </label>
              <input
                type="text"
                required
                maxLength={120}
                value={street}
                onChange={(e) => setStreet(e.target.value)}
                placeholder="e.g. Unit 4B, Sto. Rosario St."
                className="w-full text-xs p-2.5 rounded-lg border border-gray-300 focus:outline-none focus:border-[#1565c0] bg-white"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                Barangay *
              </label>
              <input
                type="text"
                required
                maxLength={80}
                value={barangay}
                onChange={(e) => setBarangay(e.target.value)}
                placeholder="e.g. Balibago, Cutcut, Malabanias"
                className="w-full text-xs p-2.5 rounded-lg border border-gray-300 focus:outline-none focus:border-[#1565c0] bg-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                Landmark or Delivery Instructions *
              </label>
              <input
                type="text"
                required
                maxLength={160}
                value={landmark}
                onChange={(e) => setLandmark(e.target.value)}
                placeholder="e.g. Near Holy Angel University, blue gate"
                className="w-full text-xs p-2.5 rounded-lg border border-gray-300 focus:outline-none focus:border-[#1565c0] bg-white"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                Delivery Contact Phone (Optional)
              </label>
              <input
                type="tel"
                maxLength={20}
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="e.g. 0917-123-4567"
                className="w-full text-xs p-2.5 rounded-lg border border-gray-300 focus:outline-none focus:border-[#1565c0] bg-white"
              />
            </div>
          </div>

          {/* Location Privacy Notice */}
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 pt-1">
            <Info className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span>Your location coordinates are used only to verify delivery availability and navigate your order.</span>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-2.5 pt-2 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-outline btn-sm px-4 rounded-xl text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isFormValid}
              className={`btn btn-primary btn-sm px-6 rounded-xl text-xs font-bold text-white shadow-sm transition-all ${
                !isFormValid ? 'opacity-60 cursor-not-allowed' : ''
              }`}
            >
              Confirm Delivery Location
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
};

export default DeliveryLocationModal;
