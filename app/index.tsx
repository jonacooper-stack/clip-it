import { Redirect } from 'expo-router';

// The app's home is the Feed tab at /feed. On the web, "/" is the marketing
// landing page (site/index.html), so the app never relies on "/" itself; any
// in-app navigation to "/" lands here and goes to the feed.
export default function Index() {
  return <Redirect href="/feed" />;
}
