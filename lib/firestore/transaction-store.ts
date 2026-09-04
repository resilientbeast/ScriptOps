import type { Firestore, Transaction } from "firebase-admin/firestore";

export type StateCollection = "demoInstances" | "rippleRuns" | "usageDaily";

export interface StateTransaction {
  get<T>(collection: StateCollection, id: string): Promise<T | null>;
  set<T>(collection: StateCollection, id: string, value: T): void;
  update<T extends object>(
    collection: StateCollection,
    id: string,
    patch: Partial<T>,
  ): void;
}

export interface TransactionalStateStore {
  runTransaction<T>(work: (transaction: StateTransaction) => Promise<T>): Promise<T>;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class InMemoryStateStore implements TransactionalStateStore {
  private readonly documents = new Map<string, unknown>();
  private tail: Promise<void> = Promise.resolve();

  async runTransaction<T>(
    work: (transaction: StateTransaction) => Promise<T>,
  ): Promise<T> {
    let release!: () => void;
    const previous = this.tail;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previous;

    const staged = new Map<string, unknown>();
    const transaction: StateTransaction = {
      get: async <Value>(collection: StateCollection, id: string) => {
        const key = this.key(collection, id);
        const value = staged.has(key) ? staged.get(key) : this.documents.get(key);
        return value === undefined ? null : clone(value as Value);
      },
      set: <Value>(collection: StateCollection, id: string, value: Value) => {
        staged.set(this.key(collection, id), clone(value));
      },
      update: <Value extends object>(
        collection: StateCollection,
        id: string,
        patch: Partial<Value>,
      ) => {
        const key = this.key(collection, id);
        const existing = staged.has(key)
          ? staged.get(key)
          : this.documents.get(key);
        if (!existing || typeof existing !== "object") {
          throw new Error(`Cannot update missing document ${key}`);
        }
        staged.set(key, { ...clone(existing), ...clone(patch) });
      },
    };

    try {
      const result = await work(transaction);
      staged.forEach((value, key) => this.documents.set(key, value));
      return result;
    } finally {
      release();
    }
  }

  private key(collection: StateCollection, id: string): string {
    return `${collection}/${id}`;
  }
}

function convertFirestoreValues(value: unknown): unknown {
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof value.toDate === "function"
  ) {
    return value.toDate();
  }

  if (Array.isArray(value)) {
    return value.map(convertFirestoreValues);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        convertFirestoreValues(child),
      ]),
    );
  }

  return value;
}

export class FirestoreStateStore implements TransactionalStateStore {
  constructor(
    private readonly firestore: Firestore,
    private readonly namespace = "",
  ) {}

  runTransaction<T>(
    work: (transaction: StateTransaction) => Promise<T>,
  ): Promise<T> {
    return this.firestore.runTransaction((nativeTransaction) =>
      work(this.wrap(nativeTransaction)),
    );
  }

  async clearNamespace(): Promise<void> {
    if (!this.namespace) {
      throw new Error("Refusing to clear un-namespaced state collections");
    }

    await Promise.all(
      (["demoInstances", "rippleRuns", "usageDaily"] as const).map(
        (collection) =>
          this.firestore.recursiveDelete(
            this.firestore.collection(this.collectionName(collection)),
          ),
      ),
    );
  }

  private collectionName(collection: StateCollection): string {
    return this.namespace ? `${this.namespace}_${collection}` : collection;
  }

  private wrap(transaction: Transaction): StateTransaction {
    return {
      get: async <Value>(collection: StateCollection, id: string) => {
        const snapshot = await transaction.get(
          this.firestore.collection(this.collectionName(collection)).doc(id),
        );
        return snapshot.exists
          ? (convertFirestoreValues(snapshot.data()) as Value)
          : null;
      },
      set: <Value>(collection: StateCollection, id: string, value: Value) => {
        transaction.set(
          this.firestore.collection(this.collectionName(collection)).doc(id),
          value as FirebaseFirestore.DocumentData,
        );
      },
      update: <Value extends object>(
        collection: StateCollection,
        id: string,
        patch: Partial<Value>,
      ) => {
        transaction.update(
          this.firestore.collection(this.collectionName(collection)).doc(id),
          patch as FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>,
        );
      },
    };
  }
}
