import type { ImageSourcePropType } from 'react-native';

// A curated set of the uploaded wildlife shots for the welcome gallery. Add or
// reorder freely — each entry is just a bundled image + a label.
export interface GalleryPhoto {
  photo: ImageSourcePropType;
  label: string;
}

export const GALLERY: GalleryPhoto[] = [
  { photo: require('../../assets/photos/grey-fox.jpg'), label: 'Grey fox' },
  { photo: require('../../assets/photos/moose.jpg'), label: 'Moose' },
  { photo: require('../../assets/photos/2-fawns.jpg'), label: 'Fawns' },
  { photo: require('../../assets/photos/zebra.jpg'), label: 'Zebra' },
  { photo: require('../../assets/photos/sloth.jpg'), label: 'Sloth' },
  { photo: require('../../assets/photos/okapi.jpg'), label: 'Okapi' },
  { photo: require('../../assets/photos/porcupine.jpg'), label: 'Porcupine' },
  { photo: require('../../assets/photos/buck.jpg'), label: 'Buck' },
  { photo: require('../../assets/photos/chipmunk.jpg'), label: 'Chipmunk' },
  { photo: require('../../assets/photos/austrich.jpg'), label: 'Ostrich' },
  { photo: require('../../assets/photos/wharthog.jpg'), label: 'Warthog' },
  { photo: require('../../assets/photos/weazel.jpg'), label: 'Weasel' },
  { photo: require('../../assets/photos/wild-horses.jpg'), label: 'Wild horses' },
];
