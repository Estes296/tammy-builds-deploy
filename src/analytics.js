import posthog from 'posthog-js';

let initialized = false;

function deviceType() {
  const width = window.innerWidth || 0;
  if (width <= 767) return 'mobile';
  if (width <= 1024) return 'tablet';
  return 'desktop';
}

function referrerSource() {
  if (!document.referrer) return 'direct';
  try {
    const host = new URL(document.referrer).hostname.replace(/^www\./, '');
    if (host.includes('instagram.com')) return 'instagram';
    if (host.includes('facebook.com')) return 'facebook';
    if (host.includes('linkedin.com')) return 'linkedin';
    if (host.includes('google.')) return 'google';
    if (host.includes('chatgpt.com') || host.includes('openai.com')) return 'chatgpt';
    return host;
  } catch {
    return 'unknown';
  }
}

export function initAnalytics() {
  if (initialized) return;

  posthog.init('phc_uzRgkY7jYhKLRh2zsGMVJaaPhSP8tsaSNsgvgqjsytXz', {
    api_host: 'https://us.i.posthog.com',
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: true,
    person_profiles: 'identified_only'
  });

  initialized = true;

  const params = new URLSearchParams(window.location.search);
  trackEvent('tool_opened', {
    source: params.get('utm_source') || referrerSource(),
    medium: params.get('utm_medium') || null,
    campaign: params.get('utm_campaign') || null,
    content: params.get('utm_content') || null,
    device_type: deviceType(),
    referrer_source: referrerSource(),
    landing_path: window.location.pathname,
    viewport_width: window.innerWidth || null
  });
}

export function trackEvent(name, properties = {}) {
  if (!initialized) return;

  posthog.capture(name, {
    tool: 'contract_budget_inspector',
    app_version: '0.1.6-learning',
    device_type: deviceType(),
    ...properties
  });
}
