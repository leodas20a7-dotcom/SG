// Global variable to store the company's timezone.
// This is set when the user logs in and their profile is fetched in App.jsx.
let companyTimezone = "UTC";

export function setCompanyTimezone(tz) {
  if (tz) {
    companyTimezone = tz;
  }
}

export function getCompanyTimezone() {
  return companyTimezone;
}

/**
 * Format a UTC ISO string into the local company timezone time (e.g., 08:30 AM)
 */
export function formatLocalTime(isoString) {
  if (!isoString) return "—";
  try {
    const date = new Date(isoString);
    return new Intl.DateTimeFormat("en-AU", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: companyTimezone
    }).format(date);
  } catch (err) {
    // Fallback if timezone is invalid
    return new Date(isoString).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
}

/**
 * Format a UTC ISO string into the local company timezone date (e.g., Mon, 3 Jul)
 */
export function formatLocalDate(isoString) {
  if (!isoString) return "";
  try {
    const date = new Date(isoString);
    return new Intl.DateTimeFormat("en-AU", {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: companyTimezone
    }).format(date);
  } catch (err) {
    return new Date(isoString).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
  }
}

/**
 * Generic formatting function to convert any date object/string to a specific Intl string
 */
export function formatToLocal(isoString, options) {
  if (!isoString) return "";
  try {
    const date = new Date(isoString);
    return new Intl.DateTimeFormat("en-AU", {
      ...options,
      timeZone: companyTimezone
    }).format(date);
  } catch (err) {
    return new Date(isoString).toLocaleString("en-AU", options);
  }
}
