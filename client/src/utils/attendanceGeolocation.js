/**
 * Browser geolocation for office attendance (must match server geofence).
 */
export function requestAttendancePosition() {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(
        new Error(
          'This browser does not support GPS location. Use a current browser and HTTPS (required for location on most devices).'
        )
      );
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy_m: pos.coords.accuracy != null ? pos.coords.accuracy : null
        });
      },
      (err) => {
        const code = err && err.code;
        if (code === 1) {
          reject(
            new Error(
              'Location permission denied. Allow location access in your browser settings — attendance must be recorded while you are at the office compound.'
            )
          );
          return;
        }
        if (code === 2) {
          reject(new Error('Location unavailable. Move to an area with better GPS signal and try again.'));
          return;
        }
        if (code === 3) {
          reject(new Error('Location request timed out. Try again outdoors or near a window.'));
          return;
        }
        reject(new Error(err.message || 'Could not read your location.'));
      },
      { enableHighAccuracy: true, timeout: 28000, maximumAge: 0 }
    );
  });
}
