const DATABASE_NAME = "anosynthCsvDatabase";
const DATABASE_VERSION = 1;
const STORE_NAME = "sourceCsvFiles";
const SOURCE_FILE_KEY = "latest-source-csv";

function openSourceCsvDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB недоступен в этой среде"));
      return;
    }

    const openRequest = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    openRequest.onupgradeneeded = () => {
      const database = openRequest.result;

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
      reject(transaction.error ?? new Error("Транзакция IndexedDB была прервана"));
    };
  });
}

export async function saveSourceCsvFile(file: File): Promise<void> {
  const database = await openSourceCsvDatabase();

  try {
    await runStoreTransaction(database, "readwrite", (store) => {
      store.clear();
      store.put(file, SOURCE_FILE_KEY);
    });
  } finally {
    database.close();
  }
}
