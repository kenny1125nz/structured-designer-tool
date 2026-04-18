// CRUD operations for the `graphs` object store

import type { Node } from "../types";
import { openDb, getStore, STORE_GRAPHS } from "./index";

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllGraphs(): Promise<Node[]> {
  const db = await openDb();
  return request<Node[]>(
    getStore(db, STORE_GRAPHS, "readonly").getAll() as IDBRequest<Node[]>,
  );
}

export async function getGraph(id: string): Promise<Node | undefined> {
  const db = await openDb();
  return request<Node | undefined>(
    getStore(db, STORE_GRAPHS, "readonly").get(id) as IDBRequest<
      Node | undefined
    >,
  );
}

export async function putGraph(graph: Node): Promise<void> {
  const db = await openDb();
  await request(getStore(db, STORE_GRAPHS, "readwrite").put(graph));
}

export async function deleteGraph(id: string): Promise<void> {
  const db = await openDb();
  await request(getStore(db, STORE_GRAPHS, "readwrite").delete(id));
}
