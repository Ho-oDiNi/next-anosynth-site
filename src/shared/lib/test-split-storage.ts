const DATABASE_NAME = "anosynthCsvDatabase";
const DATABASE_VERSION = 2;
const STORE_NAME = "testSplits";
const TEST_SPLIT_KEY = "latest-test-split";

interface SaveTestSplitPayload {
  headers: string[];
  rows: string[][];
  testSplit: number;
  stratified: boolean;
}

export interface SavedTestSplit extends SaveTestSplitPayload {
  updatedAt: string;
}

function openTestSplitDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB недоступен в этой среде"));
      return;
    }

    const openRequest = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    openRequest.onupgradeneeded = () => {
      const database = openRequest.result;

      if (!database.objectStoreNames.contains("sourceCsvFiles")) {
        database.createObjectStore("sourceCsvFiles");
      }

      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };

    openRequest.onsuccess = () => {
      resolve(openRequest.result);
    };

    openRequest.onerror = () => {
      reject(openRequest.error ?? new Error("Не удалось открыть IndexedDB"));
    };
  });
}

function runStoreTransaction(
  database: IDBDatabase,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);

    action(store);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => {
      reject(transaction.error ?? new Error("Ошибка транзакции IndexedDB"));
    };
    transaction.onabort = () => {
      reject(
        transaction.error ?? new Error("Транзакция IndexedDB была прервана"),
      );
    };
  });
}

function readFromStore<T>(
  database: IDBDatabase,
  key: IDBValidKey,
): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(key);

    request.onsuccess = () => {
      resolve(request.result as T | undefined);
    };

    request.onerror = () => {
      reject(request.error ?? new Error("Не удалось прочитать данные из IndexedDB"));
    };
  });
}

export async function saveTestSplit(payload: SaveTestSplitPayload): Promise<void> {
  const database = await openTestSplitDatabase();

  try {
    await runStoreTransaction(database, "readwrite", (store) => {
      store.put(
        {
          ...payload,
          updatedAt: new Date().toISOString(),
        },
        TEST_SPLIT_KEY,
      );
    });
  } finally {
    database.close();
  }
}

export async function getSavedTestSplit(): Promise<SavedTestSplit | null> {
  const database = await openTestSplitDatabase();

  try {
    const result = await readFromStore<SavedTestSplit>(database, TEST_SPLIT_KEY);
    return result ?? null;
  } finally {
    database.close();
  }
}
