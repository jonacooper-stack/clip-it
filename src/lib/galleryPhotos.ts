import type { ImageSourcePropType } from 'react-native';

// A curated set of the uploaded wildlife shots for the welcome gallery. `aspect`
// is the photo's width/height — the gallery sizes each card to match so the full
// animal shows (no zoomed-in cropping). Add/reorder freely.
export interface GalleryPhoto {
  photo: ImageSourcePropType;
  label: string;
  aspect: number;
}

export const GALLERY: GalleryPhoto[] = [
  { photo: require('../../assets/photos/grey-fox.jpg'), label: 'Grey fox', aspect: 1.5 },
  { photo: require('../../assets/photos/moose.jpg'), label: 'Moose', aspect: 1.5 },
  { photo: require('../../assets/photos/2-fawns.jpg'), label: 'Fawns', aspect: 1.5 },
  { photo: require('../../assets/photos/zebra.jpg'), label: 'Zebra', aspect: 1.5 },
  { photo: require('../../assets/photos/sloth.jpg'), label: 'Sloth', aspect: 1.5 },
  { photo: require('../../assets/photos/okapi.jpg'), label: 'Okapi', aspect: 1.33 },
  { photo: require('../../assets/photos/porcupine.jpg'), label: 'Porcupine', aspect: 1.47 },
  { photo: require('../../assets/photos/buck.jpg'), label: 'Buck', aspect: 1.5 },
  { photo: require('../../assets/photos/chipmunk.jpg'), label: 'Chipmunk', aspect: 1.5 },
  { photo: require('../../assets/photos/austrich.jpg'), label: 'Ostrich', aspect: 0.66 },
  { photo: require('../../assets/photos/wharthog.jpg'), label: 'Warthog', aspect: 1.5 },
  { photo: require('../../assets/photos/weazel.jpg'), label: 'Weasel', aspect: 1.5 },
  { photo: require('../../assets/photos/wild-horses.jpg'), label: 'Wild horses', aspect: 1.51 },
];
