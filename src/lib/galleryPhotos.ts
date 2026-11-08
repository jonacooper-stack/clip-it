import type { ImageSourcePropType } from 'react-native';

// Wildlife photos for the welcome gallery (Wikimedia Commons; credits in
// src/lib/photoCredits.ts). `aspect` is the photo's width/height so each card
// shows the whole animal. Add/reorder freely.
export interface GalleryPhoto {
  photo: ImageSourcePropType;
  label: string;
  aspect: number;
}

export const GALLERY: GalleryPhoto[] = [
  { photo: require('../../assets/photos/fox-vole.jpg'), label: 'Red fox', aspect: 1.5 },
  { photo: require('../../assets/photos/kingfisher-wings.jpg'), label: 'Kingfisher', aspect: 1.5 },
  { photo: require('../../assets/photos/otters.jpg'), label: 'River otters', aspect: 1.1 },
  { photo: require('../../assets/photos/moose.jpg'), label: 'Moose', aspect: 1.19 },
  { photo: require('../../assets/photos/lynx.jpg'), label: 'Lynx', aspect: 1.5 },
  { photo: require('../../assets/photos/osprey.jpg'), label: 'Osprey', aspect: 1.5 },
  { photo: require('../../assets/photos/snowy-owl.jpg'), label: 'Snowy owl', aspect: 1.53 },
  { photo: require('../../assets/photos/raccoon.jpg'), label: 'Raccoon', aspect: 1.28 },
  { photo: require('../../assets/photos/hummingbird.jpg'), label: 'Hummingbird', aspect: 1.54 },
  { photo: require('../../assets/photos/chipmunk.jpg'), label: 'Chipmunk', aspect: 1.38 },
  { photo: require('../../assets/photos/wolf.jpg'), label: 'Gray wolf', aspect: 0.8 },
  { photo: require('../../assets/photos/barn-owl.jpg'), label: 'Barn owl', aspect: 1.43 },
  { photo: require('../../assets/photos/bison.jpg'), label: 'Bison', aspect: 1.53 },
];
