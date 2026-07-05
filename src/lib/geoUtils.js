// Shared Geolocation & Photo Utilities for Safety Guard

export function calcDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function getLocation() {
  const getCoordinates = (options) => {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, options);
    });
  };

  return new Promise(async (resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported by this device."));
      return;
    }
    const options = { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 };
    try {
      let pos = await getCoordinates(options);
      // If accuracy is poor (e.g. cellular/Wi-Fi triangulation > 150m), 
      // wait 1 second for the hardware GPS to warm up/lock and try again.
      if (pos.coords.accuracy > 150) {
        await new Promise((r) => setTimeout(r, 1000));
        pos = await getCoordinates(options);
      }
      if (Date.now() - pos.timestamp > 300000) {
        reject(new Error("GPS data is stale (> 5 minutes old). Please refresh your location or restart your browser."));
        return;
      }

      resolve({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      });
    } catch (err) {
      if (err.code === 1) {
        reject(new Error("GPS permission denied. Please allow location access in your browser settings."));
      } else {
        reject(new Error("Could not retrieve GPS location. Ensure your device's GPS is enabled."));
      }
    }
  });
}

export function dataUrlToBlob(dataUrl) {
  const parts = dataUrl.split(",");
  const mime = parts[0].match(/:(.*?);/)[1];
  const raw = atob(parts[1]);
  const u8 = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    u8[i] = raw.charCodeAt(i);
  }
  return new Blob([u8], { type: mime });
}

export async function uploadPhoto(guardId, dataUrl, supabase) {
  if (!dataUrl) throw new Error("No photo data. Camera may be unavailable.");
  const blob = dataUrlToBlob(dataUrl);
  const fileName = `guard_${guardId}_${Date.now()}.jpg`;
  const { error: uploadErr } = await supabase.storage
    .from("guard-photos")
    .upload(fileName, blob, { contentType: "image/jpeg" });

  if (uploadErr) {
    if (uploadErr.message.includes("bucket")) {
      throw new Error('Storage bucket "guard-photos" not found. Ask admin to create it in Supabase.');
    }
    throw new Error("Photo upload failed: " + uploadErr.message);
  }

  const { data: urlData } = supabase.storage
    .from("guard-photos")
    .getPublicUrl(fileName);
  return urlData.publicUrl;
}

export function calculateAttendanceStatus(checkInTimeStr, checkOutTimeStr, shift) {
  if (!checkInTimeStr) {
    return "Absent";
  }

  // Parse check-in and check-out times
  const checkIn = new Date(checkInTimeStr);
  const checkOut = checkOutTimeStr ? new Date(checkOutTimeStr) : null;

  // If there's no check-out yet, it's still dynamically shown as On Duty
  if (!checkOut) {
    return "Present";
  }

  const actualDurationMs = checkOut.getTime() - checkIn.getTime();
  
  // 1. check in and check out within 30 minutes (actual work duration < 30 minutes) -> Absent
  if (actualDurationMs < 30 * 60 * 1000) {
    return "Absent";
  }

  if (!shift || !shift.start_time || !shift.end_time) {
    return "Present"; // Default to Present if no shift details are available
  }

  // We need to compare checkIn and checkOut with the scheduled shift timings on the day of check-in
  const checkInDateStr = checkInTimeStr.split("T")[0];

  // format time: if shift.start_time is e.g. "06:00" format to "06:00:00"
  const formatTime = (t) => t.length === 5 ? `${t}:00` : t;
  const schedStartStr = `${checkInDateStr}T${formatTime(shift.start_time)}`;
  const schedStart = new Date(schedStartStr);

  let schedEndStr = `${checkInDateStr}T${formatTime(shift.end_time)}`;
  let schedEnd = new Date(schedEndStr);

  // If shift ends on the next day (midnight crossing, e.g. start at 22:00, end at 06:00)
  if (schedEnd < schedStart) {
    schedEnd.setDate(schedEnd.getDate() + 1);
  }

  // 2. check in must be on time or within 30-minute grace period
  const checkInLateMs = checkIn.getTime() - schedStart.getTime();
 
  // 3. 10 minutes before check out when duty end that's not problem
  const checkOutEarlyMs = schedEnd.getTime() - checkOut.getTime();
 
  const isCheckInOnTime = checkInLateMs <= 30 * 60 * 1000; // 30-minute grace period
  const isCheckOutOnTime = checkOutEarlyMs <= 10 * 60 * 1000;
 
  if (isCheckInOnTime && isCheckOutOnTime) {
    return "Present";
  }

  // otherwise even if half shift completed then log out means show half day
  const scheduledDurationMs = schedEnd.getTime() - schedStart.getTime();
  const halfScheduledDurationMs = scheduledDurationMs / 2;

  if (actualDurationMs >= halfScheduledDurationMs) {
    return "Half Day";
  }

  return "Absent";
}
