/// <reference types="vite/client" />

// Application paths remain independent of the hosting directory.
export const hashRouting = import.meta.env?.MODE === 'pages';
const hostingBase = import.meta.env?.BASE_URL || '/';
type BrowserLocation = Pick<Location, 'pathname' | 'search' | 'hash'>;

export function routeLocation(value: BrowserLocation, useHash = hashRouting) {
  const route = useHash && value.hash.startsWith('#/')
    ? new URL(value.hash.slice(1), 'https://route.invalid')
    : useHash ? new URL('/', 'https://route.invalid') : value;
  return {pathname: route.pathname, search: route.search};
}

export function currentLocation() { return routeLocation(window.location); }

export function browserHref(to: string, useHash = hashRouting, base = hostingBase) {
  if (!to.startsWith('/') || to.startsWith('//')) return to;
  return useHash ? base.replace(/\/?$/, '/') + '#' + to : to;
}

// Only intercept ordinary internal navigation, never downloads or new tabs.
export function clickedRoute(event: MouseEvent): string | null {
  if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return null;
  const anchor = event.target instanceof Element ? event.target.closest('a') : null;
  if (!anchor || anchor.hasAttribute('download') || (anchor.target && anchor.target !== '_self')) return null;
  const url = new URL(anchor.href, window.location.href);
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== window.location.origin) return null;
  if (hashRouting && (url.pathname !== hostingBase || !url.hash.startsWith('#/'))) return null;
  const target = routeLocation(url), current = currentLocation();
  if (target.pathname === current.pathname && target.search === current.search) return null;
  return target.pathname + target.search;
}
