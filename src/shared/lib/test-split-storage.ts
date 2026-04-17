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

function runStoreTransaction<T>(
  database: IDBDatabase,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T> | void,
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
