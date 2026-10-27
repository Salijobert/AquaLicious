/**
 * AquaLicious Customer Copy Constants
 * Centralized, editable copy for all customer-facing views.
 * Strictly adheres to verified information: zero invented lab claims,
 * certifications, fake permits, or unverified contact details.
 */

export const COPY = {
  // Brand & General
  BRAND_NAME: 'AquaLicious',
  BRAND_TAGLINE: 'Pure · Safe · Refreshed',
  PORTAL_TITLE: 'AquaLicious - Pure Mineral Water & Station Refills',

  // Login Page Copy
  LOGIN: {
    CARD_TITLE: 'AquaLicious Login',
    CARD_SUBTITLE: 'Sign in to your AquaLicious account.',
    USERNAME_LABEL: 'Username or Email',
    USERNAME_PLACEHOLDER: 'Enter your username or email',
    PASSWORD_LABEL: 'Password',
    PASSWORD_PLACEHOLDER: 'Enter password',
    SUBMIT_BUTTON: 'Log In',
    SUBMIT_BUTTON_LOADING: 'Signing In...',
    FORGOT_PASSWORD_LINK: 'Forgot password?',
    REGISTER_PROMPT: 'Need an account? Register here',

    // Left-side pitch (selling mineral water to customers)
    HERO_TAG: 'Water Refilling & Delivery',
    HERO_HEADLINE: 'Pure Mineral Water, Delivered to Your Door',
    HERO_SUBTEXT:
      'Order refills, bottled water, and more from AquaLicious. Fresh, safe, and refreshing, with pickup or delivery whenever you need it.',

    // Three customer benefits
    BENEFITS: [
      {
        title: 'Pure & Safe',
        sub: 'Clean, refreshing mineral water'
      },
      {
        title: 'Easy Ordering',
        sub: 'Order in a few taps'
      },
      {
        title: 'Pickup or Delivery',
        sub: 'Choose what works for you'
      }
    ],

    // APK promotion banner on login page
    APK_BANNER_TITLE: 'Order faster on your phone',
    APK_BANNER_SUBTEXT: 'Get the AquaLicious Android app.',
    APK_BUTTON_TEXT: 'Download APK',
    APK_DOWNLOAD_BUTTON: 'Download APK'
  },

  // Customer Storefront Copy
  STOREFRONT: {
    STATUS_OPEN: 'Open Today',
    STATUS_PURITY: 'Filtered Drinking Water',
    STATUS_SERVICE: 'Pickup & Delivery',

    HERO_TAG: 'AquaLicious Storefront',
    HERO_TITLE: 'Fresh, Clean Mineral Water at Your Fingertips',
    HERO_HEADLINE: 'Fresh, Clean Mineral Water at Your Fingertips',
    HERO_SUBTEXT:
      'Select your container refills or purchase new bottles online. Enjoy easy station pickup or prompt doorstep delivery.',

    ORDER_CTA: 'Order Refills',
    ABOUT_CTA: 'About Our Station',
    APP_CTA: 'Get Android App',

    CONTACT_HOTLINE: 'Customer Support In-App',
    CONTACT_HUB: 'Local Station Pickup',
    // [NEEDS OWNER CONFIRMATION] - Operating Hours quick bar
    CONTACT_HOURS: 'Open 7:00 AM - 7:00 PM',

    QUICK_REFILL_TITLE: 'Quick Container Refills',
    QUICK_REFILL_SUBTEXT: 'Select standard 5-gallon containers for immediate refill addition',

    // [NEEDS OWNER CONFIRMATION] - Filtration / Quality / Process Steps
    PROCESS_TAG: 'Our Refilling Standards',
    PROCESS_TITLE: 'Carefully Prepared Drinking Water',
    PROCESS_SUBTEXT:
      'From filtration to protective sealing, every bottle is handled with care for your household.',

    PROCESS_STEPS: [
      {
        step: '01',
        title: 'Multi-Stage Filtration',
        desc: 'Water is filtered to remove sediment, particles, and unwanted taste.'
      },
      {
        step: '02',
        title: 'Thorough Purification',
        desc: 'Processed to provide clean, clear, and refreshing mineral drinking water.'
      },
      {
        step: '03',
        title: 'Quality Checking',
        desc: 'Carefully checked for clarity, taste, and freshness before bottling.'
      },
      {
        step: '04',
        title: 'Capping & Protective Seal',
        desc: 'Bottles are capped and fitted with a protective seal prior to dispatch.'
      }
    ],

    // [NEEDS OWNER CONFIRMATION] - Hygiene Commitments
    COMMITMENTS_TAG: 'Our Quality Standards',
    COMMITMENTS: [
      {
        title: 'Thorough Container Washing',
        desc: 'Every container is washed and rinsed thoroughly before refilling.'
      },
      {
        title: 'Clean Sealed Caps',
        desc: 'Sealed caps protect your water from outside dust during transit.'
      },
      {
        title: 'Reliable Delivery',
        desc: 'Prompt doorstep delivery or easy station pickup at your convenience.'
      }
    ],

    // Catalog Header
    CATALOG_TITLE: 'Water Refills, Containers & Supplies',
    CATALOG_SUBTEXT: 'Select your water container type and quantity. Add to cart to place your order.',
    SEARCH_PLACEHOLDER: 'Search refills or containers...'
  },

  // About Station Modal Copy
  ABOUT: {
    TITLE: 'About AquaLicious',
    SUBTITLE: 'Water Refilling Station & Delivery Service',
    DESCRIPTION:
      'AquaLicious provides clean, safe, and refreshing mineral drinking water to households, offices, and local establishments. We focus on cleanliness, quality filtration, and dependable delivery service.',
    // [NEEDS OWNER CONFIRMATION] - Quality Standards
    QUALITY_HEADER: 'Our Commitment to Quality',
    QUALITY_STANDARDS: [
      {
        title: 'Clean & Filtered',
        desc: 'Carefully filtered through multi-stage filtration to provide clear, refreshing drinking water.'
      },
      {
        title: 'Container Hygiene',
        desc: 'Every container is thoroughly washed, inspected, and capped with a protective seal.'
      }
    ],
    HOURS_TITLE: 'Station Operating Hours',
    // [NEEDS OWNER CONFIRMATION] - Operating Hours
    HOURS: 'Open Daily: 7:00 AM – 7:00 PM',
    ADDRESS_LABEL: 'Service Area',
    ADDRESS: 'Local station pickup & delivery service',
    PHONE_LABEL: 'Customer Support',
    PHONE: 'Available in-app & via order status',
    EMAIL_LABEL: 'Station Email',
    EMAIL: 'aqualiciousadmin@gmail.com'
  },

  // Customer Mobile App Modal / Banner Copy
  APP: {
    TITLE: 'AquaLicious for Android',
    MODAL_TITLE: 'Get the AquaLicious Android App',
    MODAL_SUBTITLE: 'Order Water Faster from Your Phone',
    DESCRIPTION:
      'Install the AquaLicious Android application to order water refills in a few taps, receive real-time order updates, and manage your account.',
    BUTTON_DOWNLOAD: 'Download APK Package',
    DOWNLOAD_BUTTON: 'Download APK Package',
    FEATURES: [
      {
        title: 'Quick Reorders',
        desc: 'Repeat past orders with ease directly from your phone.'
      },
      // [NEEDS OWNER CONFIRMATION] - Delivery tracking
      {
        title: 'Delivery Tracking',
        desc: 'Follow order progress from station queue to delivery.'
      },
      // [NEEDS OWNER CONFIRMATION] - Payment methods
      {
        title: 'Flexible Payments',
        desc: 'Pay via cash on delivery, GCash, or Maya.'
      },
      // [NEEDS OWNER CONFIRMATION] - Consumption / account history
      {
        title: 'Account History',
        desc: 'View past receipts and water consumption history anytime.'
      }
    ]
  }
};
