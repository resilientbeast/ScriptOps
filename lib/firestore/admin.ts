import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

let firestore: Firestore | undefined;

export function getAdminFirestore(projectId: string): Firestore {
  if (firestore) {
    return firestore;
  }

  const app = getApps()[0] ?? initializeApp({ projectId });
  firestore = getFirestore(app);
  firestore.settings({ ignoreUndefinedProperties: true });

  return firestore;
}
