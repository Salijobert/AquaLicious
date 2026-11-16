import { COPY } from './copy.js';

/**
 * AquaLicious Terms and Conditions & Data Privacy Policy
 * Compliant with Republic Act No. 10173 (Philippine Data Privacy Act of 2012)
 */
export const TERMS_VERSION = "2026-11-16.4";
export const PREVIOUS_TERMS_VERSION = "2026-11-16.3";
export const TERMS_VERSION_ALLOWLIST: readonly string[] = [
  TERMS_VERSION,
  PREVIOUS_TERMS_VERSION
];

export interface TermsSection {
  title: string;
  paragraphs: string[];
}

export const TERMS_CONTENT: {
  title: string;
  version: string;
  effectiveDate: string;
  sections: TermsSection[];
} = {
  title: "AquaLicious Customer Terms and Conditions & Data Privacy Notice",
  version: TERMS_VERSION,
  effectiveDate: "November 16, 2026 (Revision 6)",
  sections: [
    {
      title: "1. Introduction & Acceptance of Terms",
      paragraphs: [
        "Welcome to AquaLicious. By registering an account, ordering water products, or utilizing our mobile application and web portal, you agree to comply with and be bound by these Terms and Conditions and our Privacy Policy.",
        "AquaLicious operates water refilling, bottle distribution, and delivery services. These terms govern your rights and obligations as a customer."
      ]
    },
    {
      title: "2. Personal Data We Collect",
      paragraphs: [
        "In accordance with the Philippine Data Privacy Act of 2012 (Republic Act No. 10173), we collect only the minimum personal information necessary to deliver our services, including:",
        "• Identification and contact data: Full name, account username, verified email address, and optional delivery recipient contact number.",
        "• Delivery & Geographic Location Data: Physical delivery address, barangay, landmark, and pinned GPS coordinates (latitude and longitude) strictly within our Angeles City service area. Location coordinates are collected solely to determine delivery eligibility within our designated boundary and facilitate accurate dispatch.",
        "• Payment transaction information: Transaction reference numbers and digital payment receipts (e.g., GCash, Maya screenshot proofs) uploaded for verification.",
        "• Technical device data: IP address, user agent, and session identifiers for security audit logs and fraud prevention."
      ]
    },
    {
      title: "3. Purpose and Legal Basis for Processing",
      paragraphs: [
        "Your personal data is collected and processed based on contractual necessity and legitimate business interests for the following specified purposes:",
        "• Receiving, queuing, and delivering water refilling orders and container purchases.",
        // Boundary source: OpenStreetMap approximation, status: NEEDS OWNER CONFIRMATION
        "• Verifying delivery address coordinates within our designated Angeles City service perimeter.",
        "• Verifying mobile payment claims and matching merchant transaction reference numbers.",
        "• Notifying customers regarding order dispatch, delivery status, and service advisories.",
        "• Maintaining accurate sales, tax, and inventory movement records required by law."
      ]
    },
    {
      title: "4. Storage, Retention, and Security Measures",
      paragraphs: [
        "We implement organizational, physical, and technical security safeguards to protect your personal data against unauthorized access, loss, or alteration.",
        "• Security controls include encrypted transport (TLS/HTTPS), salted credentials, role-based access restrictions, and strict server-side authorization checks.",
        "• Geographic Coordinates Retention: Customer delivery location coordinates and recipient contact numbers are stored strictly in connection with delivery fulfillment and order history. Coordinates, addresses, and recipient phone numbers are never made public, never logged in general application logs, and never displayed on public dashboard tiles.",
        "• Unverified Account Policy: In accordance with our storage limitation and security principles, registered customer accounts that remain unverified after thirty (30) days from registration are automatically and permanently deleted from our authentication systems and database. Prior warning notifications are sent before scheduled deletion.",
        "• Active verified customer data is retained only for as long as your account remains active or as required by applicable Philippine laws and statutory tax/accounting regulations."
      ]
    },
    {
      title: "5. Disclosure, Third-Party Mapping & Geolocation Processors",
      paragraphs: [
        "AquaLicious does not sell, rent, or trade customer personal data to third parties.",
        "Data may only be shared with verified service processors strictly necessary to deliver the service:",
        "• Google Firebase: Tokenized authentication and secure identity infrastructure.",
        "• OpenStreetMap & Nominatim: Map display tiles and reverse geocoding lookups connect directly from your client browser to OpenStreetMap Foundation servers. These services are governed by their own terms and privacy policies (including OpenStreetMap's Acceptable Use Policy and Privacy Policy). When map tiles or reverse geocoding lookups are requested, OpenStreetMap servers can see your client IP address and HTTP referrer.",
        "• Google Maps External Navigation: When station dispatchers or administrators view delivery locations, coordinates may be opened in Google Maps. Use of Google Maps is subject to Google's Privacy Policy and Terms of Service.",
        "OpenStreetMap, Nominatim, and Google are independent third-party services operating under their respective privacy policies and terms of use."
      ]
    },
    {
      title: "6. Your Rights under the Philippine Data Privacy Act (RA 10173)",
      paragraphs: [
        "As a data subject, you are entitled to the full rights guaranteed under RA 10173, including:",
        "• Right to be Informed: The right to know how your personal data is collected, processed, and stored.",
        "• Right to Access: The right to request reasonable access to your personal data held in our records.",
        "• Right to Rectification: The right to dispute any inaccuracy or error in your personal data and have it corrected.",
        "• Right to Erasure or Blocking: The right to suspend, withdraw, or order the removal of your personal data upon legitimate grounds.",
        "• Right to Damages: The right to be indemnified for any damages sustained due to inaccurate, incomplete, or unlawfully processed data.",
        "• Right to Data Portability: The right to obtain a copy of your personal data in an electronic, structured format.",
        "• Right to File a Complaint: If you feel your privacy rights have been violated, you have the right to lodge a complaint with the National Privacy Commission (NPC) at https://privacy.gov.ph."
      ]
    },
    {
      title: "7. Data Protection Officer (DPO) Contact",
      paragraphs: [
        `For any privacy inquiries, requests to exercise your data subject rights, or feedback regarding these terms, please contact the AquaLicious Data Protection Officer ${
          COPY.DPO_CONTACT_EMAIL
            ? `via email at ${COPY.DPO_CONTACT_EMAIL} or through our station administration desk.`
            : `through our station administration desk.`
        }`
      ]
    }
  ]
};
