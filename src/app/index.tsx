import { LibraryScreen } from '@/screens/LibraryScreen';

import { libraryActions } from '@/services/libraryActions';

export default function Library() {
  return <LibraryScreen actions={libraryActions} />;
}
