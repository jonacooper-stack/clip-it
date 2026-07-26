import { Redirect } from 'expo-router';

// This route exists only so the center tab slot is registered — the raised
// button in the tab bar intercepts the press and opens the camera directly.
// If it's ever navigated to (it shouldn't be), send it on to the camera.
export default function CaptureRedirect() {
  return <Redirect href="/capture/camera" />;
}
